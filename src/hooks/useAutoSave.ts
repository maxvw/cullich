import { useEffect, useRef } from "react";
import type { Photo } from "../types";

export function useAutoSave(
  photos: Photo[],
  enabled: boolean,
  onSave: (photos: Photo[]) => Promise<void>,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSave(photosRef.current);
    }, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, onSave]);
}
