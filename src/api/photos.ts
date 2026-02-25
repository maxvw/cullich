import { init, searchAssets, getAssetThumbnailPath, getAssetOriginalPath, getAssetPlaybackPath, type AssetResponseDto } from "@immich/sdk";
import { join } from "path";

init({
  baseUrl: process.env.IMMICH_BASE_URL,
  apiKey: process.env.IMMICH_API_KEY,
});

const url = (path: string) => {
  const parsedUrl = URL.parse(process.env.IMMICH_BASE_URL);
  parsedUrl.pathname = join(parsedUrl.pathname, path);
  parsedUrl.search = parsedUrl.search
    ? parsedUrl.search + `&apiKey=${process.env.IMMICH_API_KEY}`
    : `?apiKey=${process.env.IMMICH_API_KEY}`;

  return parsedUrl;
};

export const PhotosApi = {
  async GET(req) {
    const response = await searchAssets({
      metadataSearchDto: {
        withExif: true,
        page: 1,
        size: 50,
      },
    });

    return Response.json({
      photos: response.assets.items.map((asset) => {
        return {
          id: asset.id,
          type: asset.type,
          thumbhash: asset.thumbhash,
          originalFileName: asset.originalFileName,
          assetThumbnailPath: url(getAssetThumbnailPath(asset.id)),
          assetOriginalPath: url(getAssetOriginalPath(asset.id)),
          assetPlaybackPath: url(getAssetPlaybackPath(asset.id)),
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
