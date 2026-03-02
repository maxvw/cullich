import {
	init,
	upsertTags,
	searchAssets,
	untagAssets,
	bulkTagAssets,
	AssetVisibility,
	getTimeBuckets,
	getAssetThumbnailPath,
	getAssetOriginalPath,
	getAssetPlaybackPath,
	type AssetResponseDto,
} from "@immich/sdk";
import { join } from "path";

init({
	baseUrl: process.env.IMMICH_BASE_URL,
	apiKey: process.env.IMMICH_API_KEY,
});

const TAG_KEEP = process.env.IMMICH_TAG_KEEP ?? "Cullich-Keep";
const TAG_REJECT = process.env.IMMICH_TAG_REJECT ?? "Cullich-Reject";

const url = (path: string, query?: string) => {
	const parsedUrl = URL.parse(process.env.IMMICH_BASE_URL);
	parsedUrl.pathname = join(parsedUrl.pathname, path);
	parsedUrl.search = parsedUrl.search
		? parsedUrl.search + `&apiKey=${process.env.IMMICH_API_KEY}`
		: `?apiKey=${process.env.IMMICH_API_KEY}`;

	if (query) {
		parsedUrl.search += `&${query}`;
	}

	return parsedUrl;
};

const fetchPhotos = async (dto, additional = {}) => {
	const allAssets = [];
	let page = 1;

	// I know. We all know. But meant to run single-user local only and
	// because we limit it by month in the app I think it's reasonable to
	// assume it's.. acceptable-ish.
	while (true) {
		const response = await searchAssets({
			metadataSearchDto: {
				...dto,
				...additional,
			},
		});

		allAssets.push(...response.assets.items);
		if (response.assets.items.length < 1000) break;
		page++;
	}

	return allAssets;
};

const assetIds = (assets) => {
	return new Set(assets.map((asset) => asset.id));
};

const tagCache = new Map<string, Promise<string>>();

async function getTagId(tag: string): Promise<string> {
	if (!tagCache.has(tag)) {
		tagCache.set(
			tag,
			upsertTags({
				tagUpsertDto: {
					tags: [tag],
				},
			})
				.then(([tag]) => tag.id)
				.catch((err) => {
					tagCache.delete(tag);
					throw err;
				}),
		);
	}

	return tagCache.get(tag)!;
}

export const getBuckets = async (req) => {
	const buckets = await getTimeBuckets({});

	return Response.json(
		buckets.map((bucket) => {
			const [year, month] = bucket.timeBucket.split("-").map(Number);
			const monthYear = new Date(year, month - 1).toLocaleString("default", {
				month: "long",
				year: "numeric",
			});

			return {
				year,
				month,
				label: monthYear,
				count: bucket.count,
			};
		}),
	);
};

export const getPhotos = async (req) => {
	const { searchParams } = new URL(req.url);

	const year = parseInt(searchParams.get("year"), 10);
	const month = parseInt(searchParams.get("month"), 10);

	const takenAfter = new Date(Date.UTC(year, month - 1, 1)).toISOString();
	const takenBefore = new Date(Date.UTC(year, month, 1)).toISOString(); // first day of next month

	const searchDto = {
		takenAfter,
		takenBefore,
		withExif: false,
		page: 1,
		size: 1000,
	};

	// Get tag IDs for keep/reject
	const pickTagId = await getTagId(TAG_KEEP);
	const rejectTagId = await getTagId(TAG_REJECT);

	// The Search API does not return the tags/tagIds in the search results,
	// despite documentation mentioning it.

	// The Search API can only do AND tagId searches so we need to do this
	// separately unfortunately.
	const rejected = assetIds(
		await fetchPhotos(searchDto, {
			tagIds: [rejectTagId],
		}),
	);

	const picked = assetIds(
		await fetchPhotos(searchDto, {
			tagIds: [pickTagId],
		}),
	);

	// And now get all assets for the given month and we'll just compare ids.
	const assets = await fetchPhotos(searchDto);

	return Response.json({
		photos: assets.map((asset) => {
			let status = "unreviewed";
			if (rejected.has(asset.id)) status = "reject";
			if (picked.has(asset.id)) status = "pick";

			return {
				id: asset.id,
				isVideo: asset.type === "VIDEO",
				thumb: url(getAssetThumbnailPath(asset.id)),
				src: url(getAssetThumbnailPath(asset.id), "size=preview"),
				videoSrc: url(getAssetPlaybackPath(asset.id)),
				status,
				initialStatus: status,
			};
		}),
	});
};

export const persistPhotos = {
	POST: async (req) => {
		const body = await req.json();

		// Get picks/reject asset ids
		const picks = body.picks ?? [];
		const rejects = body.rejects ?? [];

		// Get tag IDs for keep/reject
		const pickTagId = await getTagId(TAG_KEEP);
		const rejectTagId = await getTagId(TAG_REJECT);

		// Get all unique asset ids
		const assetIds = Array.from(new Set([...picks, ...rejects]));

		// Remove all tags
		if (assetIds.length) {
			await untagAssets({ id: pickTagId, bulkIdsDto: { ids: assetIds } });
			await untagAssets({ id: rejectTagId, bulkIdsDto: { ids: assetIds } });
		}

		// Assign correct tags
		if (picks.length) {
			await bulkTagAssets({
				tagBulkAssetsDto: { assetIds: picks, tagIds: [pickTagId] },
			});
		}

		if (rejects.length) {
			await bulkTagAssets({
				tagBulkAssetsDto: { assetIds: rejects, tagIds: [rejectTagId] },
			});
		}

		// Done.
		return Response.json({ saved: true });
	},
};
