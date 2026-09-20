import type { PublicPhoto } from "@shared/api";

export const GALLERY_PATH = "/gallery";

export interface GalleryDay {
  day: number;
  theme: string;
  photos: PublicPhoto[];
}

/**
 * The day's theme is on every photograph of that day, so printing it per tile would
 * print it fourteen times. Grouped instead, in the order the route already sorted them
 * — newest day first — which is why this walks the list rather than keying a Map and
 * re-sorting: the server decided the order and a second opinion here could disagree
 * with it.
 */
export function daysOf(photos: readonly PublicPhoto[]): GalleryDay[] {
  const days: GalleryDay[] = [];
  for (const photo of photos) {
    const last = days[days.length - 1];
    if (last?.day === photo.day) {
      last.photos.push(photo);
      continue;
    }
    days.push({ day: photo.day, theme: photo.theme, photos: [photo] });
  }
  return days;
}

/** Where a photograph sits in the whole gallery, so the lightbox's ‹ › walk every day
 * rather than stopping at the end of one. */
export function stepThrough(
  photos: readonly PublicPhoto[],
  id: number,
  delta: number,
): number {
  const at = photos.findIndex((photo) => photo.id === id);
  if (at === -1 || photos.length === 0) return id;
  const next = photos[(at + delta + photos.length) % photos.length];
  return next?.id ?? id;
}
