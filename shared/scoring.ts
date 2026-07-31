/** Its LENGTH is also how many picks a ballot has room for. */
export const RANK_POINTS = [3, 2, 1] as const;

export const HALF_WEIGHT = 50;

export const AI_SCORE_MAX = 10;

export const BONUS_POINTS = 10;

export const NO_VOTE_MULTIPLIER = 0.5;

export function pointsForRank(rank: number): number {
  return RANK_POINTS[rank - 1] ?? 0;
}

export function peerPointsFor(ranksReceived: readonly number[]): number {
  return ranksReceived.reduce((sum, rank) => sum + pointsForRank(rank), 0);
}

export interface DayEntry {
  photoId: number;
  ranksReceived: readonly number[];
  /** 1–10. Zero means no evaluation row exists, never a score of zero. */
  aiScore: number;
  bonusDetected: boolean;
  uploaderVoted: boolean;
  /** Epoch ms. The last tiebreak, so the earliest submission wins. */
  createdAt: number;
}

export interface DayScore {
  photoId: number;
  peerPoints: number;
  peerNorm: number;
  aiNorm: number;
  bonus: boolean;
  penalised: boolean;
  total: number;
  rank: number;
}

function curve(value: number, best: number): number {
  return best <= 0 ? 0 : (HALF_WEIGHT * value) / best;
}

interface Weighed {
  entry: DayEntry;
  peerPoints: number;
  peerNorm: number;
  aiNorm: number;
  penalised: boolean;
  total: number;
}

function compareForRank(a: Weighed, b: Weighed): number {
  return (
    b.total - a.total ||
    b.entry.aiScore - a.entry.aiScore ||
    a.entry.createdAt - b.entry.createdAt
  );
}

export function scoreDay(entries: readonly DayEntry[]): DayScore[] {
  const weighed = entries.map((entry) => ({
    entry,
    peerPoints: peerPointsFor(entry.ranksReceived),
  }));
  // `Math.max` of nothing is -Infinity, so the seed also covers an empty day.
  const bestPeer = Math.max(0, ...weighed.map((one) => one.peerPoints));
  const bestAi = Math.max(0, ...entries.map((entry) => entry.aiScore));

  return weighed
    .map(({ entry, peerPoints }): Weighed => {
      const peerNorm = curve(peerPoints, bestPeer);
      const aiNorm = curve(entry.aiScore, bestAi);
      const earned =
        peerNorm + aiNorm + (entry.bonusDetected ? BONUS_POINTS : 0);
      const penalised = !entry.uploaderVoted;
      return {
        entry,
        peerPoints,
        peerNorm,
        aiNorm,
        penalised,
        total: penalised ? earned * NO_VOTE_MULTIPLIER : earned,
      };
    })
    .sort(compareForRank)
    .map((one, index) => ({
      photoId: one.entry.photoId,
      peerPoints: one.peerPoints,
      peerNorm: one.peerNorm,
      aiNorm: one.aiNorm,
      bonus: one.entry.bonusDetected,
      penalised: one.penalised,
      total: one.total,
      rank: index + 1,
    }));
}
