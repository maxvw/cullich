import { serve } from "bun";
import index from "./index.html";

import { getBuckets, getPhotos } from "./api/photos";

const server = serve({
  routes: {
    "/": index,
    "/api/buckets": getBuckets,
    "/api/photos": getPhotos,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
