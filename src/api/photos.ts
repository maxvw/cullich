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
  type MetadataSearchDto,
} from "@immich/sdk";
import { join } from "path";
import { chunkArray } from "../utils/chunkArray";
import type { Asset } from "../types";

const IMMICH_BASE_URL = process.env.IMMICH_BASE_URL ?? "https://example.com";
const IMMICH_API_KEY = process.env.IMMICH_API_KEY ?? "abc123";

init({
  baseUrl: IMMICH_BASE_URL,
  apiKey: IMMICH_API_KEY,
});

const TAG_KEEP = process.env.IMMICH_TAG_KEEP ?? "Cullich-Keep";
const TAG_REJECT = process.env.IMMICH_TAG_REJECT ?? "Cullich-Reject";

const url = (path: string, query?: string) => {
  if (query) query = `?${query}`;
  else query = "";

  return `/proxy${path}${query}`;
};

const fetchPhotos = async (dto: MetadataSearchDto, additional = {}) => {
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

const assetIds = (assets: Asset[]): Set<string> => {
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

export const getBuckets = async (req: Request) => {
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

export const getPhotos = async (req: Request) => {
  const { searchParams } = new URL(req.url);

  const year = parseInt(searchParams.get("year") ?? "", 10);
  const month = parseInt(searchParams.get("month") ?? "", 10);

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
  POST: async (req: Request) => {
    const body = await req.json();

    // The API is not clear on whether there is a limit or not, but it feels
    // nicer to do this in chunks / have some limit.
    const CHUNK_SIZE = 500;

    // Get picks/reject asset ids
    const picks = body.picks ?? [];
    const rejects = body.rejects ?? [];

    // Get tag IDs for keep/reject
    const pickTagId = await getTagId(TAG_KEEP);
    const rejectTagId = await getTagId(TAG_REJECT);

    // Remove all tags in chunks
    for (const chunk of chunkArray<string>(rejects, CHUNK_SIZE)) {
      await untagAssets({ id: pickTagId, bulkIdsDto: { ids: chunk } });
    }
    for (const chunk of chunkArray<string>(picks, CHUNK_SIZE)) {
      await untagAssets({ id: rejectTagId, bulkIdsDto: { ids: chunk } });
    }

    // Assign correct tags in chunks
    for (const chunk of chunkArray<string>(picks, CHUNK_SIZE)) {
      await bulkTagAssets({
        tagBulkAssetsDto: { assetIds: chunk, tagIds: [pickTagId] },
      });
    }
    for (const chunk of chunkArray<string>(rejects, CHUNK_SIZE)) {
      await bulkTagAssets({
        tagBulkAssetsDto: { assetIds: chunk, tagIds: [rejectTagId] },
      });
    }

    // Done.
    return Response.json({ saved: true });
  },
};

export const proxyAsset = async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/proxy/, "");
  const target = new URL(`/api${path}`, IMMICH_BASE_URL);

  // Copy existing query params and add the token
  url.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  target.searchParams.set("apiKey", IMMICH_API_KEY);

  return fetch(target);
};
