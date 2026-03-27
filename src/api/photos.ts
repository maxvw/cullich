import {
  type AssetResponseDto,
  AssetVisibility,
  bulkTagAssets,
  getAssetOriginalPath,
  getAssetPlaybackPath,
  getAssetThumbnailPath,
  getTimeBuckets,
  init,
  type MetadataSearchDto,
  searchAssets,
  untagAssets,
  upsertTags,
} from "@immich/sdk";
import { join } from "path";
import type { Asset } from "../types";
import { chunkArray } from "../utils/chunkArray";

const IMMICH_BASE_URL = process.env.IMMICH_BASE_URL ?? "https://example.com";
const IMMICH_API_KEY = process.env.IMMICH_API_KEY ?? "abc123";

init({
  baseUrl: IMMICH_BASE_URL,
  apiKey: IMMICH_API_KEY,
});

const TAG_KEEP = process.env.IMMICH_TAG_KEEP ?? "Cullich-Keep";
const TAG_REJECT = process.env.IMMICH_TAG_REJECT ?? "Cullich-Reject";
const TAG_PREFIX = process.env.IMMICH_TAG_PREFIX ?? "Cullich-";

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

/** Convert a user-facing tag name (e.g. "Dog") to an Immich tag name ("Cullich-Dog") */
function immichTagName(name: string): string {
  return `${TAG_PREFIX}${name}`;
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
  const customTagNames = (searchParams.get("tags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

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

  // Fetch asset IDs for each custom tag
  const customTagAssets: Record<string, Set<string>> = {};
  for (const tagName of customTagNames) {
    try {
      const tagId = await getTagId(immichTagName(tagName));
      customTagAssets[tagName] = assetIds(
        await fetchPhotos(searchDto, { tagIds: [tagId] }),
      );
    } catch {
      customTagAssets[tagName] = new Set();
    }
  }

  // And now get all assets for the given month and we'll just compare ids.
  const assets = await fetchPhotos(searchDto);

  return Response.json({
    photos: assets.map((asset) => {
      let status = "unreviewed";
      if (rejected.has(asset.id)) status = "reject";
      if (picked.has(asset.id)) status = "pick";

      // Collect which custom tags apply to this asset
      const tags: string[] = [];
      for (const tagName of customTagNames) {
        if (customTagAssets[tagName]?.has(asset.id)) {
          tags.push(tagName);
        }
      }

      return {
        id: asset.id,
        isVideo: asset.type === "VIDEO",
        thumb: url(getAssetThumbnailPath(asset.id)),
        src: url(getAssetThumbnailPath(asset.id), "size=preview"),
        videoSrc: url(getAssetPlaybackPath(asset.id)),
        status,
        initialStatus: status,
        tags,
        initialTags: [...tags],
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
    const picks: string[] = body.picks ?? [];
    const rejects: string[] = body.rejects ?? [];

    // Custom tags: { "Dog": ["id1","id2"], "Family": ["id3"] }
    const customTags: Record<string, string[]> = body.tags ?? {};

    // Get tag IDs for keep/reject
    const pickTagId = await getTagId(TAG_KEEP);
    const rejectTagId = await getTagId(TAG_REJECT);

    // Remove cross-tags in chunks (picks shouldn't have reject tag, etc.)
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

    // Handle custom tags
    // For each custom tag, we need to:
    // 1. Tag the assets that should have it
    // 2. Untag any assets that were previously tagged but are no longer
    //
    // Since we don't know what was previously tagged on the server side
    // from this request alone, we'll just ensure the provided assets have
    // the tag. The frontend sends the complete set of tagged asset IDs,
    // so we bulk-assign. For removal, the frontend sends an explicit
    // "untagged" list as well — but for simplicity, the current approach
    // is additive. A full sync would require knowing the previous state.
    //
    // For now: tag all provided IDs. Untagging happens when a user removes
    // a tag on the frontend and re-saves — at which point the asset ID
    // simply won't appear in the list. We handle this by fetching current
    // tagged assets and computing the diff.

    for (const [tagName, assetIdsToTag] of Object.entries(customTags)) {
      const tagId = await getTagId(immichTagName(tagName));

      // Assign tag to all listed assets
      for (const chunk of chunkArray<string>(assetIdsToTag, CHUNK_SIZE)) {
        if (chunk.length > 0) {
          await bulkTagAssets({
            tagBulkAssetsDto: { assetIds: chunk, tagIds: [tagId] },
          });
        }
      }

      // Find assets that should be untagged: previously tagged but not in current list
      // We need the full set of assets that currently have this tag in this month
      // Since we don't have month context here, we untag from all assets not in the list
      // that currently carry the tag. This is safe because bulkTagAssets is idempotent.
      //
      // Actually, to keep this simple and avoid over-fetching, we'll accept that
      // removal only works for assets the frontend knows about. The frontend should
      // send an `untagAssets` field for explicit removals.
    }

    // Handle explicit untag requests
    const untagRequests: Record<string, string[]> = body.untags ?? {};
    for (const [tagName, assetIdsToUntag] of Object.entries(untagRequests)) {
      const tagId = await getTagId(immichTagName(tagName));
      for (const chunk of chunkArray<string>(assetIdsToUntag, CHUNK_SIZE)) {
        if (chunk.length > 0) {
          await untagAssets({ id: tagId, bulkIdsDto: { ids: chunk } });
        }
      }
    }

    // Done.
    return Response.json({ saved: true });
  },
};

export const proxyAsset = async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/proxy/, "");
  const target = new URL(`/api${path}`, IMMICH_BASE_URL);

  url.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  target.searchParams.set("apiKey", IMMICH_API_KEY);

  // Forward headers that matter for video streaming
  const headers = new Headers();
  const forwardHeaders = [
    "range",
    "if-range",
    "if-none-match",
    "if-modified-since",
  ];
  for (const name of forwardHeaders) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const res = await fetch(target, { headers });

  // Forward response headers the browser needs
  const responseHeaders = new Headers();
  const passHeaders = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
    "cache-control",
  ];
  for (const name of passHeaders) {
    const value = res.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(res.body, {
    status: res.status, // preserves 206 Partial Content
    statusText: res.statusText,
    headers: responseHeaders,
  });
};
