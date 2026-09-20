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

/** Ids filed at the front of the shelf, in this order. A record named here and no longer
 * in `assets/records` is simply skipped, so deleting a file needs no edit here. */
const LEAD: readonly string[] = [
  "Haal Een Pilsje Voor Mij",
  "Colombia Mia",
  "Colombia",
  "Vorig Lustrum",
];

export function shelfOrder(a: TrackName, b: TrackName): number {
  const lead = LEAD.indexOf(a.id);
  const other = LEAD.indexOf(b.id);
  if (lead !== -1 || other !== -1) {
    // `indexOf` answers -1 for a record nobody filed, which sorts BEFORE every lead
    // position if it is compared as a number — hence the two branches rather than a
    // subtraction.
    if (lead === -1) return 1;
    if (other === -1) return -1;
    return lead - other;
  }
  return a.id.localeCompare(b.id);
}

/** Sorted, because the glob's own key order is not something to lean on. */
export const SHELF: readonly ShelfRecord[] = Object.entries(FILES)
  .map(([path, url]) => ({ ...trackNameOf(path), url }))
  .sort(shelfOrder);
