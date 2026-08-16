/** Its LENGTH is also how many picks a ballot has room for. */
export const RANK_POINTS = [3, 2, 1] as const;

export const HALF_WEIGHT = 50;

export const AI_SCORE_MAX = 10;

export const BONUS_POINTS = 10;

export const NO_VOTE_MULTIPLIER = 0.5;

/** What last place still takes of a half. Zero would put a snap nobody voted for
 * beyond recovery by the other half, which is the whole point of the position. */
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
  peerNorm: number;
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

interface Weighed {
  entry: DayEntry;
  peerPoints: number;
  peerNorm: number;
  aiNorm: number;
  aiRank: number;
  penalised: boolean;
  total: number;
}

function compareForRank(a: Weighed, b: Weighed): number {
  // The AI order is not strict — a whole day can share the median — so `createdAt`
  // is what stops a tie falling through to whatever order the rows arrived in.
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
  // Without a `GEMINI_API_KEY` every snap of the day is the fallback, and ordering
  // those by anything at all hands half the day to upload time. Undifferentiated is
  // what they are, so they share the field's middle position and separate on nothing.
  const median = (field + 1) / 2;

  return weighed
    .map(({ entry, peerPoints }): Weighed => {
      const aiRank = isJudged(entry) ? rankOf(entry.aiScore, judged) : median;
      const peerNorm =
        HALF_WEIGHT * share(rankOf(peerPoints, peerField), field);
      const aiNorm = HALF_WEIGHT * share(aiRank, field);
      const earned =
        peerNorm + aiNorm + (entry.bonusDetected ? BONUS_POINTS : 0);
      const penalised = !entry.uploaderVoted;
      return {
        entry,
        peerPoints,
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
      peerNorm: one.peerNorm,
      aiNorm: one.aiNorm,
      bonus: one.entry.bonusDetected,
      penalised: one.penalised,
      total: one.total,
      rank: index + 1,
    }));
}
