import { trackNameOf, type TrackName } from "@shared/jukebox";

// Under `src/` and not `public/` because nothing can enumerate `public/` at BUILD time, and
// a committed manifest some script regenerates is a step past "redeploy".
const FILES = import.meta.glob<string>(
  "../assets/records/*.{mp3,ogg,oga,m4a,aac,flac,wav,webm}",
  { eager: true, query: "?url", import: "default" },
);

export interface ShelfRecord extends TrackName {
  url: string;
}

/** Sorted, because the glob's own key order is not something to lean on. */
export const SHELF: readonly ShelfRecord[] = Object.entries(FILES)
  .map(([path, url]) => ({ ...trackNameOf(path), url }))
  .sort((a, b) => a.id.localeCompare(b.id));
