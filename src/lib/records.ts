const STRIDE = 0.34;

const FALLOFF = 0.28;

const FADE = 0.34;

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

export function sleevesOf(count: number, at: number): Sleeve[] {
  if (count === 0) return [];
  const sleeves: Sleeve[] = [];
  // A shelf shorter than the reach shows each record ONCE: repeating it either side would
  // offer the same record as two different neighbours to step to.
  const spread = Math.min(REACH, Math.floor((count - 1) / 2));
  // Counted UP and offset rather than down from `-spread`, which is `-0` when the shelf has no
  // room either side: every `===` in here reads that as zero, but vitest's `toEqual` does not,
  // so `records.test.ts` fails on a step nothing else can tell apart.
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
