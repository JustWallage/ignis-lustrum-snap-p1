/** One figure's width, as a fraction of the crowd's box, at `scale` 1. Every position
 * below is spaced in multiples of it, so a caller that draws a figure any other width
 * gets a row that no longer stands together. */
export const CROWD_FIGURE_W = 0.12;

export interface CrowdSpot {
  member: number;
  /** The centre of the figure, across the box. */
  x: number;
  /** 0 is the back row, 1 the front one. */
  depth: number;
  scale: number;
}

export interface CrowdPlayer {
  id: number;
  name: string;
  /** What they have ON, or null for the default sprite. */
  url: string | null;
}

export interface CrowdMember extends CrowdSpot, CrowdPlayer {}

const MAX_PER_ROW = 5;

const ROW_LIMIT = 3;

const BACK_SCALE = 0.62;

/**
 * One pitch for EVERY row, in figure widths, and every row centred on the same middle:
 * that is what puts somebody in front of somebody. The narrower row's places always
 * fall inside the wider one's, so the gap from a figure to its nearest neighbour in the
 * next row is at most half a pitch — and half of this pitch is less than the two
 * half-widths that have to overlap for one to hide the other. Widen it past 1.6 and the
 * crowd becomes ranks of separate icons.
 */
const PITCH = 1.4;

const JITTER = 0.1;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(count: number, random: () => number): number[] {
  const order = Array.from({ length: count }, (_, at) => at);
  for (let at = count - 1; at > 0; at -= 1) {
    const swap = Math.floor(random() * (at + 1));
    const held = order[at] ?? at;
    order[at] = order[swap] ?? swap;
    order[swap] = held;
  }
  return order;
}

function rowsFor(count: number): number {
  if (count <= 1) return 1;
  return Math.min(ROW_LIMIT, Math.max(2, Math.ceil(count / MAX_PER_ROW)));
}

/**
 * Back to front, which is also the order it must be PAINTED in: a later figure is
 * bigger, lower and drawn over the one behind it.
 */
export function crowdLayout(count: number, seed: number): CrowdSpot[] {
  if (count <= 0) return [];
  const random = randomFrom(seed);
  const order = shuffled(count, random);
  const rows = rowsFor(count);
  // The remainder goes to the BACK, so the front row is never the crowded one.
  const counts: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    counts.push(
      Math.ceil((count - counts.reduce((a, b) => a + b, 0)) / (rows - row)),
    );
  }
  const widest = Math.max(...counts);
  // Squeezed rather than spilled once the town outgrows the box: a tighter pitch only
  // overlaps them further, which is the one property the arrangement must keep.
  const pitch =
    widest > 1
      ? Math.min(CROWD_FIGURE_W * PITCH, (1 - CROWD_FIGURE_W) / (widest - 1))
      : 0;

  const spots: CrowdSpot[] = [];
  let placed = 0;
  for (const [row, here] of counts.entries()) {
    const depth = rows === 1 ? 1 : row / (rows - 1);
    const scale = BACK_SCALE + depth * (1 - BACK_SCALE);
    const half = (CROWD_FIGURE_W * scale) / 2;
    const first = 0.5 - ((here - 1) * pitch) / 2;
    for (let at = 0; at < here; at += 1) {
      spots.push({
        member: order[placed + at] ?? 0,
        x: clamp(
          first + at * pitch + (random() - 0.5) * pitch * JITTER,
          half,
          1 - half,
        ),
        depth,
        scale,
      });
    }
    placed += here;
  }
  return spots;
}

export function crowdOf(town: CrowdPlayer[], seed: number): CrowdMember[] {
  return crowdLayout(town.length, seed).flatMap((spot) => {
    const who = town[spot.member];
    return who === undefined ? [] : [{ ...spot, ...who }];
  });
}

export function playerIn(
  town: CrowdPlayer[],
  userId: number,
): CrowdPlayer | null {
  return town.find((one) => one.id === userId) ?? null;
}

export function wornBy(town: CrowdPlayer[], userId: number): string | null {
  return playerIn(town, userId)?.url ?? null;
}
