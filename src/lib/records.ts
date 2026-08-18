// Translation and scale, never rotation: a sleeve stays PARALLEL to the screen however far
// off centre it sits, because a rotated label is an unreadable one.

const STRIDE = 0.34;

const FALLOFF = 0.28;

const FADE = 0.34;

/** Sleeves either side of the faced one, which caps the DOM at five however long the
 * directory gets. */
const REACH = 2;

export interface Sleeve {
  /** React's key, so a flick MOVES a sleeve rather than rebuilding it — which is what lets
   * CSS carry it between two placements. */
  index: number;
  step: number;
  leftPct: number;
  scale: number;
  opacity: number;
  z: number;
}

/** A directory a human fills by hand can be EMPTY, which is a shelf with no records on it
 * rather than a crash. */
export function sleevesOf(count: number, at: number): Sleeve[] {
  if (count === 0) return [];
  const sleeves: Sleeve[] = [];
  // A shelf shorter than the reach shows each record ONCE: repeating it either side would
  // offer the same record as two different neighbours to step to.
  const spread = Math.min(REACH, Math.floor((count - 1) / 2));
  // Counted UP and offset rather than down from `-spread`, which is `-0` on a shelf with no
  // room either side, and `-0` is a step nothing else in here agrees is zero.
  for (let i = 0; i <= spread * 2; i += 1) {
    const step = i - spread;
    const index = (((at + step) % count) + count) % count;
    const away = Math.abs(step);
    sleeves.push({
      index,
      step,
      leftPct: 50 + step * STRIDE * 100,
      scale: 1 / (1 + away * FALLOFF),
      opacity: 1 - away * FADE,
      z: REACH - away,
    });
  }
  return sleeves;
}

export function stepTo(count: number, at: number, delta: number): number {
  if (count === 0) return 0;
  return (((at + delta) % count) + count) % count;
}
