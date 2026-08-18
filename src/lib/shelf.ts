import { trackNameOf, type TrackName } from "@shared/jukebox";

/**
 * The whole authoring story: a file lands in `src/assets/records/`, the app is redeployed,
 * and it is on the shelf. Vite's glob runs at BUILD time, which is why the directory is
 * under `src/` and not `public/` — nothing can enumerate `public/` at build time, and a
 * committed manifest some script regenerates is the step past "redeploy" this refuses.
 */
const FILES = import.meta.glob<string>(
  "../assets/records/*.{mp3,ogg,oga,m4a,aac,flac,wav,webm}",
  { eager: true, query: "?url", import: "default" },
);

export interface ShelfRecord extends TrackName {
  url: string;
}

/** Sorted by id so the shelf reads the same on every screen and every build: the glob's
 * own key order is not something to lean on. */
export const SHELF: readonly ShelfRecord[] = Object.entries(FILES)
  .map(([path, url]) => ({ ...trackNameOf(path), url }))
  .sort((a, b) => a.id.localeCompare(b.id));
