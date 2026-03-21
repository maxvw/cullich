import { serve } from "bun";
import { getBuckets, getPhotos, persistPhotos, proxyAsset } from "./api/photos";
import index from "./index.html";

const server = serve({
  routes: {
    "/": index,
    "/api/buckets": getBuckets,
    "/api/photos": getPhotos,
    "/api/persist": persistPhotos,
    "/proxy/*": proxyAsset,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

process.on("SIGINT", () => {
  process.exit();
});

console.log(`🚀 Server running at ${server.url}`);
