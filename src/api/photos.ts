import {
	init,
	searchAssets,
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

	// The Search API does not return the tags/tagIds in the search results,
	// despite documentation mentioning it.

	// The Search API can only do AND tagId searches so we need to do this
	// separately unfortunately.
	const rejected = assetIds(
		await fetchPhotos(searchDto, {
			tagIds: ["4aa1e6a6-f42b-4f9b-a4ec-77fea559264a"],
		}),
	);

	const approved = assetIds(
		await fetchPhotos(searchDto, {
			tagIds: ["70a72afe-c24d-4419-a19a-a7c3313a65ce"],
		}),
	);

	// And now get all assets for the given month and we'll just compare ids.
	const assets = await fetchPhotos(searchDto);

	return Response.json({
		photos: assets.map((asset) => {
			let status = "unreviewed";
			if (rejected.has(asset.id)) status = "reject";
			if (approved.has(asset.id)) status = "pick";

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
