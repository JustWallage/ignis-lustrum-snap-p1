/** Its LENGTH is also how many picks a ballot has room for. */
export const RANK_POINTS = [3, 2, 1] as const;

export const HALF_WEIGHT = 50;

export const AI_SCORE_MAX = 10;

export const BONUS_POINTS = 10;

export const NO_VOTE_MULTIPLIER = 0.5;

export const FLOOR = 0.2;

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
  /** `"failed"` carries the fallback 5 that every failure writes, which is not a 5
   * the jury ever meant — with no key, the whole day reads that way. */
  aiStatus: "ok" | "failed" | null;
  bonusDetected: boolean;
  uploaderVoted: boolean;
  /** Epoch ms. The last tiebreak, so the earliest submission wins. */
  createdAt: number;
}

export interface DayScore {
  photoId: number;
  peerPoints: number;
  /** How many 1st / 2nd / 3rd place votes the snap collected, indexed by rank - 1. */
  ballot: number[];
  peerNorm: number;
  /** The two POSITIONS the halves above were paid for. `rankOf` averages the positions
   * a tied group occupies, so neither is an integer in general and an unjudged snap
   * takes the field's median — a caller that rounds one of these to name a placing
   * names a placing nobody took. Re-deriving them outside this module is how the
   * archive and the standings started disagreeing. */
  peerPlace: number;
  juryPlace: number;
  aiNorm: number;
  bonus: boolean;
  penalised: boolean;
  total: number;
  rank: number;
}

function share(rank: number, field: number): number {
  // A field of one has no position to take, and `field - 1` divides by zero.
  if (field <= 1) return 1;
  return FLOOR + (1 - FLOOR) * ((field - rank) / (field - 1));
}

function rankOf(value: number, among: readonly number[]): number {
  const better = among.filter((other) => other > value).length;
  const tied = among.filter((other) => other === value).length;
  return better + (tied + 1) / 2;
}

function isJudged(entry: DayEntry): boolean {
  return entry.aiScore > 0 && entry.aiStatus !== "failed";
}

function ballotFor(ranksReceived: readonly number[]): number[] {
  return RANK_POINTS.map(
    (_unused, index) =>
      ranksReceived.filter((rank) => rank === index + 1).length,
  );
}

interface Weighed {
  entry: DayEntry;
  peerPoints: number;
  peerRank: number;
  peerNorm: number;
  aiNorm: number;
  aiRank: number;
  penalised: boolean;
  total: number;
}

function compareForRank(a: Weighed, b: Weighed): number {
  return (
    b.total - a.total ||
    a.aiRank - b.aiRank ||
    a.entry.createdAt - b.entry.createdAt
  );
}

export function scoreDay(entries: readonly DayEntry[]): DayScore[] {
  const field = entries.length;
  const weighed = entries.map((entry) => ({
    entry,
    peerPoints: peerPointsFor(entry.ranksReceived),
  }));
  const peerField = weighed.map((one) => one.peerPoints);
  const judged = entries.filter(isJudged).map((entry) => entry.aiScore);
  // A `failed` 5 is not a 5 the jury meant and a missing row is not a zero, so neither
  // may be ranked among the real scores: on a mixed day the fallback would beat every
  // honest 4 and the absent row would sink to last. The field's middle position is what
  // an absence is worth.
  const median = (field + 1) / 2;

  return weighed
    .map(({ entry, peerPoints }): Weighed => {
      const aiRank = isJudged(entry) ? rankOf(entry.aiScore, judged) : median;
      const peerRank = rankOf(peerPoints, peerField);
      const peerNorm = HALF_WEIGHT * share(peerRank, field);
      const aiNorm = HALF_WEIGHT * share(aiRank, field);
      const earned =
        peerNorm + aiNorm + (entry.bonusDetected ? BONUS_POINTS : 0);
      const penalised = !entry.uploaderVoted;
      return {
        entry,
        peerPoints,
        peerRank,
        peerNorm,
        aiNorm,
        aiRank,
        penalised,
        total: penalised ? earned * NO_VOTE_MULTIPLIER : earned,
      };
    })
    .sort(compareForRank)
    .map((one, index) => ({
      photoId: one.entry.photoId,
      peerPoints: one.peerPoints,
      ballot: ballotFor(one.entry.ranksReceived),
      peerNorm: one.peerNorm,
      peerPlace: one.peerRank,
      juryPlace: one.aiRank,
      aiNorm: one.aiNorm,
      bonus: one.entry.bonusDetected,
      penalised: one.penalised,
      total: one.total,
      rank: index + 1,
    }));
}
