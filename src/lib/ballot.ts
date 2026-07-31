import { MAX_PICKS } from "@shared/api";

/** POSITION IS THE RANK — `picks[0]` holds 1st — so there is no gap and no two firsts,
 * and whatever a tap does, what comes back is a contiguous 1..n. */

export type Picks = readonly number[];

export const RANKS: readonly number[] = Array.from(
  { length: MAX_PICKS },
  (_unused, index) => index + 1,
);

const RANK_LABELS = ["1ST", "2ND", "3RD"];

export function rankLabel(rank: number): string {
  return RANK_LABELS[rank - 1] ?? `#${rank}`;
}

export function rankOf(picks: Picks, photoId: number): number | null {
  const index = picks.indexOf(photoId);
  return index === -1 ? null : index + 1;
}

export function podium(picks: Picks): (number | null)[] {
  return RANKS.map((rank) => picks[rank - 1] ?? null);
}

export interface RankTap {
  id: number;
  rank: number;
  /** Refused HERE rather than only by a disabled button, so an unrankable snap can
   * never put a hole in the ballot. */
  rankable: boolean;
}

export interface RankResult {
  picks: number[];
  note: string | null;
}

export function tapRank(picks: Picks, tap: RankTap): RankResult {
  const { id, rank, rankable } = tap;
  if (!rankable || rank < 1 || rank > MAX_PICKS) {
    return { picks: [...picks], note: null };
  }

  const held = rankOf(picks, id);
  if (held === rank) {
    return { picks: picks.filter((pick) => pick !== id), note: null };
  }

  const slots: (number | null)[] = [];
  for (let slot = 0; slot < Math.max(picks.length, rank); slot += 1) {
    slots.push(picks[slot] ?? null);
  }
  const displaced = slots[rank - 1] ?? null;
  slots[rank - 1] = id;
  if (held !== null) slots[held - 1] = displaced;

  return {
    picks: slots.filter((slot) => slot !== null),
    note:
      displaced === null
        ? null
        : `${rankLabel(rank)} moved from another snap`.toUpperCase(),
  };
}

/** The number is an ARGUMENT rather than a literal, so the sentence and the sum cannot
 * drift apart. Casting NO votes is what costs you; a ballot of one is not penalised. */
export function noVoteWarning(multiplier: number): string {
  const kept = Math.round(multiplier * 100);
  return `Hand nothing in on this ballot and your own snap keeps only ${kept}% of what it scores today. One pick is enough to be safe — you do not owe me three.`;
}

export function sameBallot(a: Picks, b: Picks): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
