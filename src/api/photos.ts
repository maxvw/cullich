import { init, searchAssets, getTimeBuckets, getAssetThumbnailPath, getAssetOriginalPath, getAssetPlaybackPath, type AssetResponseDto } from "@immich/sdk";
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

export const getBuckets = async (req) => {
  const buckets = await getTimeBuckets({});

  return Response.json(buckets.map((bucket) => {
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
  }));
}

export const getPhotos = {
  async GET(req) {
    const { searchParams } = new URL(req.url);

    const year = parseInt(searchParams.get("year"), 10);
    const month = parseInt(searchParams.get("month"), 10);

    const takenAfter = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const takenBefore = new Date(Date.UTC(year, month, 1)).toISOString(); // first day of next month

    const response = await searchAssets({
      metadataSearchDto: {
        takenAfter,
        takenBefore,
        withExif: false, // no need for it
        page: 1,
        size: 1000,
      },
    });

    return Response.json({
      photos: response.assets.items.map((asset) => {
        return {
          id: asset.id,
          isVideo: asset.type === "VIDEO",
          thumb: url(getAssetThumbnailPath(asset.id)),
          src: url(getAssetThumbnailPath(asset.id), "size=preview"),
          videoSrc: url(getAssetPlaybackPath(asset.id)),
        };
      })
    });
  },
  async PUT(req) {
    return Response.json({
      photos: []
    });
  },
};
