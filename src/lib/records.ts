/**
 * The record shelf's geometry, and nothing else — the numbers live here, the stylesheet
 * holds no copy of them.
 *
 * NOT `lib/wheel.ts`. The drum rotates a rigid barrel about the X axis and every plate is
 * TANGENT to it, tilted out of the screen plane and magnified by the perspective as it
 * comes round; `isFacing` exists because the far side would otherwise show through the
 * front. A record shelf must do the opposite: each sleeve stays PARALLEL to the screen
 * however far off centre it is, because a rotated label is an unreadable label and the
 * faced record's artist and title are the point. So this is translation and scale, no
 * rotation, no `perspective`, no `preserve-3d` and no hidden far side — and it shares no
 * arithmetic with the barrel to duplicate.
 */

/** How far apart neighbouring sleeves sit, as a fraction of the window's width. */
const STRIDE = 0.34;

/** How much smaller each step off centre is. The faced record is 1. */
const FALLOFF = 0.28;

/** How much dimmer each step off centre is. */
const FADE = 0.34;

/** Sleeves either side of the faced one. Two is what makes a flick read as a shelf moving
 * rather than a card being replaced, and it caps the DOM at five sleeves however long the
 * directory gets. */
const REACH = 2;

export interface Sleeve {
  /** Index into the shelf. The key, so React moves a sleeve rather than rebuilding it —
   * which is what lets CSS carry the movement between two placements. */
  index: number;
  /** Steps from the faced record: 0 is facing you, negative is to its left. */
  step: number;
  leftPct: number;
  scale: number;
  opacity: number;
  /** Painter's order: the faced sleeve is highest, so its neighbours tuck behind it. */
  z: number;
}

/**
 * Where every visible sleeve sits, given how many records are on the shelf and which one
 * is faced. An EMPTY shelf places nothing — a directory a human fills by hand can be
 * empty, and that is a shelf with no records on it, not a crash.
 */
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

/** Wraps at both ends, the way the big viewer's paging does: the shelf is a loop, so there
 * is no dead end to press against. A one-record shelf steps nowhere. */
export function stepTo(count: number, at: number, delta: number): number {
  if (count === 0) return 0;
  return (((at + delta) % count) + count) % count;
}
