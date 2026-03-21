import { useEffect } from "react";
import type { Photo } from "../types";

export function usePreloader(photos: Photo[], currentIndex: number) {
  useEffect(() => {
    const preload = (idx: number) => {
      if (idx >= 0 && idx < photos.length && !photos[idx].isVideo) {
        const img = new Image();
        img.src = photos[idx].src;
      }
    };
    preload(currentIndex + 1);
    preload(currentIndex + 2);
    preload(currentIndex - 1);
  }, [currentIndex, photos]);
}
