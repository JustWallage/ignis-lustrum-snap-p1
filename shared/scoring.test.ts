import { describe, expect, it } from "vitest";
import {
  AI_SCORE_MAX,
  BONUS_POINTS,
  FLOOR,
  HALF_WEIGHT,
  NO_VOTE_MULTIPLIER,
  peerPointsFor,
  pointsForRank,
  RANK_POINTS,
  scoreDay,
  type DayEntry,
} from "./scoring";

function entry(overrides: Partial<DayEntry> & { photoId: number }): DayEntry {
  return {
    ranksReceived: [],
    aiScore: 0,
    aiStatus: null,
    bonusDetected: false,
    uploaderVoted: true,
    createdAt: 0,
    ...overrides,
  };
}

function judged(
  overrides: Partial<DayEntry> & { photoId: number; aiScore: number },
): DayEntry {
  return entry({ aiStatus: "ok", ...overrides });
}

function forPhoto(scored: ReturnType<typeof scoreDay>, photoId: number) {
  const found = scored.find((one) => one.photoId === photoId);
  if (found === undefined) throw new Error(`photo ${photoId} was not scored`);
  return found;
}

function normAt(rank: number, field: number): number {
  return HALF_WEIGHT * (FLOOR + (1 - FLOOR) * ((field - rank) / (field - 1)));
}

function rankFrom(norm: number, field: number): number {
  return field - ((norm / HALF_WEIGHT - FLOOR) / (1 - FLOOR)) * (field - 1);
}

describe("peer points", () => {
  it("pays 3 / 2 / 1 for a 1st, 2nd and 3rd place vote", () => {
    expect(RANK_POINTS).toEqual([3, 2, 1]);
    expect(pointsForRank(1)).toBe(3);
    expect(pointsForRank(2)).toBe(2);
    expect(pointsForRank(3)).toBe(1);
  });

  it("pays nothing for a rank no ballot has", () => {
    expect(pointsForRank(0)).toBe(0);
    expect(pointsForRank(4)).toBe(0);
    expect(pointsForRank(-1)).toBe(0);
  });

  it("adds up every vote a snap received", () => {
    expect(peerPointsFor([])).toBe(0);
    expect(peerPointsFor([1, 1, 3])).toBe(7);
  });
});

describe("scoring a day", () => {
  it("gives a lone submission the whole of both halves and rank 1", () => {
    const [only] = scoreDay([judged({ photoId: 7, aiScore: 4 })]);
    expect(only).toEqual({
      photoId: 7,
      peerPoints: 0,
      ballot: [0, 0, 0],
      peerNorm: HALF_WEIGHT,
      peerPlace: 1,
      juryPlace: 1,
      aiNorm: HALF_WEIGHT,
      bonus: false,
      penalised: false,
      total: HALF_WEIGHT * 2,
      rank: 1,
    });
  });

  it("scores an empty day as nothing at all", () => {
    expect(scoreDay([])).toEqual([]);
  });

  it("stands every snap on the same peer position when nobody voted", () => {
    const scored = scoreDay([
      judged({ photoId: 1, aiScore: 8 }),
      judged({ photoId: 2, aiScore: 4 }),
    ]);
    for (const one of scored) {
      expect(one.peerPoints).toBe(0);
      expect(one.peerNorm).toBeCloseTo(normAt(1.5, 2));
    }
    expect(forPhoto(scored, 1).aiNorm).toBeCloseTo(HALF_WEIGHT);
    expect(forPhoto(scored, 2).aiNorm).toBeCloseTo(normAt(2, 2));
    expect(scored.map((one) => one.photoId)).toEqual([1, 2]);
  });

  it("flattens the AI half when every evaluation failed the same way", () => {
    const scored = scoreDay([
      entry({ photoId: 1, aiScore: 5, aiStatus: "failed", ranksReceived: [1] }),
      entry({ photoId: 2, aiScore: 5, aiStatus: "failed" }),
    ]);
    for (const one of scored) expect(one.aiNorm).toBeCloseTo(normAt(1.5, 2));
    expect(forPhoto(scored, 1).peerNorm).toBeCloseTo(HALF_WEIGHT);
    expect(forPhoto(scored, 2).peerNorm).toBeCloseTo(normAt(2, 2));
  });

  it("weighs the peer and AI leaders exactly the same", () => {
    const scored = scoreDay([
      judged({ photoId: 1, ranksReceived: [1, 1, 1], aiScore: 1 }),
      judged({ photoId: 2, aiScore: 10 }),
    ]);
    const peerLeader = forPhoto(scored, 1);
    const aiLeader = forPhoto(scored, 2);
    expect(peerLeader.peerNorm).toBeCloseTo(HALF_WEIGHT);
    expect(aiLeader.aiNorm).toBeCloseTo(HALF_WEIGHT);
    expect(peerLeader.peerNorm).toBe(aiLeader.aiNorm);
    expect(peerLeader.total).toBeCloseTo(aiLeader.total);
  });

  it("pays the peer half for the POSITION, whatever the margin was", () => {
    const wide = scoreDay([
      judged({ photoId: 1, ranksReceived: [1, 2], aiScore: 5 }),
      judged({ photoId: 2, ranksReceived: [3], aiScore: 5 }),
    ]);
    const narrow = scoreDay([
      judged({ photoId: 1, ranksReceived: [1, 2], aiScore: 5 }),
      judged({ photoId: 2, ranksReceived: [1, 3], aiScore: 5 }),
    ]);
    expect(forPhoto(wide, 1).peerPoints).toBe(5);
    expect(forPhoto(narrow, 2).peerPoints).toBe(4);
    expect(forPhoto(wide, 1).peerNorm).toBeCloseTo(HALF_WEIGHT);
    expect(forPhoto(wide, 2).peerNorm).toBeCloseTo(normAt(2, 2));
    expect(forPhoto(narrow, 1).peerNorm).toBe(forPhoto(wide, 1).peerNorm);
    expect(forPhoto(narrow, 2).peerNorm).toBe(forPhoto(wide, 2).peerNorm);
  });

  it("leaves a snap last on both halves with a fifth of each, not nothing", () => {
    const scored = scoreDay([
      judged({ photoId: 1, ranksReceived: [1], aiScore: 9 }),
      judged({ photoId: 2, ranksReceived: [2], aiScore: 7 }),
      judged({ photoId: 3, aiScore: 5 }),
    ]);
    const last = forPhoto(scored, 3);
    expect(last.rank).toBe(3);
    expect(last.peerNorm).toBeCloseTo(FLOOR * HALF_WEIGHT);
    expect(last.aiNorm).toBeCloseTo(FLOOR * HALF_WEIGHT);
    expect(last.total).toBeCloseTo(2 * FLOOR * HALF_WEIGHT);
    expect(last.total).toBeCloseTo(20);
  });

  it("adds the bonus on top of both halves", () => {
    const scored = scoreDay([
      judged({ photoId: 1, aiScore: 5, bonusDetected: true }),
      judged({ photoId: 2, aiScore: 5 }),
    ]);
    expect(forPhoto(scored, 1).bonus).toBe(true);
    expect(forPhoto(scored, 1).total - forPhoto(scored, 2).total).toBeCloseTo(
      BONUS_POINTS,
    );
    expect(forPhoto(scored, 2).total).toBeCloseTo(normAt(1.5, 2) * 2);
  });

  it("halves the total of somebody who voted for nobody, after the bonus", () => {
    const scored = scoreDay([
      judged({
        photoId: 1,
        aiScore: 5,
        bonusDetected: true,
        uploaderVoted: false,
      }),
      judged({ photoId: 2, aiScore: 5, bonusDetected: true }),
    ]);
    const freeloader = forPhoto(scored, 1);
    const earned = normAt(1.5, 2) * 2 + BONUS_POINTS;
    expect(freeloader.penalised).toBe(true);
    // Halving after the bonus, so the ten points are halved too. Applying the
    // penalty first would have left the bonus whole on top of a halved pair.
    expect(freeloader.total).toBeCloseTo(earned * NO_VOTE_MULTIPLIER);
    expect(forPhoto(scored, 2).penalised).toBe(false);
    expect(forPhoto(scored, 2).total).toBeCloseTo(earned);
    expect(scored.map((one) => one.photoId)).toEqual([2, 1]);
  });

  it("still reports the halves it earned before the penalty took the total", () => {
    const [only] = scoreDay([
      judged({ photoId: 1, aiScore: 5, uploaderVoted: false }),
    ]);
    expect(only?.aiNorm).toBe(HALF_WEIGHT);
    expect(only?.peerNorm).toBe(HALF_WEIGHT);
    expect(only?.total).toBe(HALF_WEIGHT * 2 * NO_VOTE_MULTIPLIER);
  });

  it("breaks a tie on the AI position before the upload time", () => {
    const scored = scoreDay([
      judged({ photoId: 1, aiScore: 10, createdAt: 900 }),
      judged({
        photoId: 2,
        ranksReceived: [1, 1, 1],
        aiScore: 1,
        createdAt: 1,
      }),
    ]);
    expect(forPhoto(scored, 1).total).toBeCloseTo(forPhoto(scored, 2).total);
    expect(scored.map((one) => one.photoId)).toEqual([1, 2]);
  });

  it("breaks a three-way tie on the AI position, then on who uploaded first", () => {
    const scored = scoreDay([
      judged({ photoId: 1, ranksReceived: [1], aiScore: 5, createdAt: 300 }),
      judged({ photoId: 2, ranksReceived: [1], aiScore: 7, createdAt: 200 }),
      judged({ photoId: 3, ranksReceived: [1], aiScore: 5, createdAt: 100 }),
    ]);
    for (const one of scored) expect(one.peerNorm).toBeCloseTo(normAt(2, 3));
    expect(scored.map((one) => one.photoId)).toEqual([2, 3, 1]);
    expect(scored.map((one) => one.rank)).toEqual([1, 2, 3]);
    expect(forPhoto(scored, 3).total).toBe(forPhoto(scored, 1).total);
  });

  it("ranks a dead heat by upload time when nothing else separates it", () => {
    const scored = scoreDay([
      judged({ photoId: 1, ranksReceived: [2], aiScore: 6, createdAt: 900 }),
      judged({ photoId: 2, ranksReceived: [2], aiScore: 6, createdAt: 100 }),
      judged({ photoId: 3, ranksReceived: [2], aiScore: 6, createdAt: 500 }),
    ]);
    const totals = new Set(scored.map((one) => one.total));
    expect(totals.size).toBe(1);
    expect(scored.map((one) => one.photoId)).toEqual([2, 3, 1]);
  });

  it("numbers the ranks 1..n with no gaps and no shared places", () => {
    const scored = scoreDay([
      judged({ photoId: 1, ranksReceived: [1], aiScore: 9 }),
      judged({ photoId: 2, aiScore: 9 }),
      judged({ photoId: 3, ranksReceived: [2], aiScore: 1 }),
      judged({ photoId: 4, aiScore: 9, bonusDetected: true }),
    ]);
    expect(scored.map((one) => one.rank)).toEqual([1, 2, 3, 4]);
    expect(scored.map((one) => one.photoId)).toEqual([1, 4, 2, 3]);
  });

  it("leaves the day it was handed alone", () => {
    const entries = [
      judged({ photoId: 2, aiScore: 1, createdAt: 5 }),
      judged({ photoId: 1, aiScore: 9 }),
    ];
    const snapshot = structuredClone(entries);
    scoreDay(entries);
    expect(entries).toEqual(snapshot);
  });
});

describe("a tied group takes the average of the positions it occupies", () => {
  it("keeps the day's peer positions adding up to n(n+1)/2", () => {
    const field = 6;
    const scored = scoreDay([
      judged({ photoId: 1, ranksReceived: [1, 1], aiScore: 5 }),
      judged({ photoId: 2, ranksReceived: [1, 1], aiScore: 5 }),
      judged({ photoId: 3, ranksReceived: [1], aiScore: 5 }),
      judged({ photoId: 4, ranksReceived: [1], aiScore: 5 }),
      judged({ photoId: 5, ranksReceived: [1], aiScore: 5 }),
      judged({ photoId: 6, aiScore: 5 }),
    ]);
    expect(scored.map((one) => one.peerPoints).sort()).toEqual([
      0, 3, 3, 3, 6, 6,
    ]);

    const ranks = scored.map((one) => rankFrom(one.peerNorm, field));
    expect(ranks.reduce((sum, rank) => sum + rank, 0)).toBeCloseTo(
      (field * (field + 1)) / 2,
    );
    expect(rankFrom(forPhoto(scored, 1).peerNorm, field)).toBeCloseTo(1.5);
    expect(rankFrom(forPhoto(scored, 3).peerNorm, field)).toBeCloseTo(4);
    expect(rankFrom(forPhoto(scored, 6).peerNorm, field)).toBeCloseTo(6);
    expect(forPhoto(scored, 1).peerNorm).toBe(forPhoto(scored, 2).peerNorm);
    expect(forPhoto(scored, 3).peerNorm).toBe(forPhoto(scored, 5).peerNorm);
  });

  it("pays two snaps on the same AI score the mean of their two positions", () => {
    const scored = scoreDay([
      judged({ photoId: 1, aiScore: 9 }),
      judged({ photoId: 2, aiScore: 9 }),
      judged({ photoId: 3, aiScore: 1 }),
    ]);
    const tied = forPhoto(scored, 1);
    expect(tied.aiNorm).toBe(forPhoto(scored, 2).aiNorm);
    expect(tied.aiNorm).toBeCloseTo((normAt(1, 3) + normAt(2, 3)) / 2);
    expect(forPhoto(scored, 3).aiNorm).toBeCloseTo(normAt(3, 3));
  });
});

// The two properties everybody misreads as a bug, pinned so nobody "fixes" them:
// `aiNorm` is FLOOR*HALF_WEIGHT..HALF_WEIGHT measured against the DAY's field, not a
// rating out of ten.
describe("the two positions the halves were paid for", () => {
  it("hands back the peer position rather than leaving it inside the half", () => {
    const field = 6;
    const scored = scoreDay([
      judged({ photoId: 1, ranksReceived: [1, 1], aiScore: 5 }),
      judged({ photoId: 2, ranksReceived: [1, 1], aiScore: 5 }),
      judged({ photoId: 3, ranksReceived: [1], aiScore: 5 }),
      judged({ photoId: 4, ranksReceived: [1], aiScore: 5 }),
      judged({ photoId: 5, ranksReceived: [1], aiScore: 5 }),
      judged({ photoId: 6, aiScore: 5 }),
    ]);
    // The same positions the halves above were paid for, so a table printing one of
    // these cannot disagree with the number beside it.
    for (const one of scored) {
      expect(one.peerPlace).toBeCloseTo(rankFrom(one.peerNorm, field));
    }
    expect(forPhoto(scored, 1).peerPlace).toBe(1.5);
    expect(forPhoto(scored, 3).peerPlace).toBe(4);
    expect(forPhoto(scored, 6).peerPlace).toBe(6);
    expect(scored.reduce((sum, one) => sum + one.peerPlace, 0)).toBeCloseTo(
      (field * (field + 1)) / 2,
    );
  });

  it("gives a tied jury group the average of the positions it occupies", () => {
    const scored = scoreDay([
      judged({ photoId: 1, aiScore: 9 }),
      judged({ photoId: 2, aiScore: 9 }),
      judged({ photoId: 3, aiScore: 1 }),
    ]);
    expect(forPhoto(scored, 1).juryPlace).toBe(1.5);
    expect(forPhoto(scored, 2).juryPlace).toBe(1.5);
    expect(forPhoto(scored, 3).juryPlace).toBe(3);
  });

  it("stands an unjudged snap on the field's median jury position", () => {
    const field = 4;
    const scored = scoreDay([
      judged({ photoId: 1, aiScore: 8 }),
      judged({ photoId: 2, aiScore: 4 }),
      entry({ photoId: 3, aiScore: 5, aiStatus: "failed" }),
      entry({ photoId: 4 }),
    ]);
    const median = (field + 1) / 2;
    expect(forPhoto(scored, 3).juryPlace).toBe(median);
    expect(forPhoto(scored, 4).juryPlace).toBe(median);
    // A field nobody judged is every snap on that same median, not a first place each.
    const none = scoreDay([entry({ photoId: 1 }), entry({ photoId: 2 })]);
    expect(none.map((one) => one.juryPlace)).toEqual([1.5, 1.5]);
  });

  it("counts the ballot a snap collected per rank, naming no voter", () => {
    const scored = scoreDay([
      entry({ photoId: 1, ranksReceived: [1, 3, 1] }),
      entry({ photoId: 2, ranksReceived: [2] }),
      entry({ photoId: 3 }),
    ]);
    expect(forPhoto(scored, 1).ballot).toEqual([2, 0, 1]);
    expect(forPhoto(scored, 2).ballot).toEqual([0, 1, 0]);
    expect(forPhoto(scored, 3).ballot).toEqual([0, 0, 0]);
    expect(forPhoto(scored, 1).ballot).toHaveLength(RANK_POINTS.length);
    // The counts are what pays the points, so the two cannot drift.
    for (const one of scored) {
      expect(one.peerPoints).toBe(
        one.ballot.reduce(
          (sum, count, index) => sum + count * pointsForRank(index + 1),
          0,
        ),
      );
    }
  });

  it("ignores a rank no ballot has room for, as the points already do", () => {
    const [only] = scoreDay([entry({ photoId: 1, ranksReceived: [1, 9] })]);
    expect(only?.ballot).toEqual([1, 0, 0]);
    expect(only?.peerPoints).toBe(3);
  });
});

describe("the AI half, and why the leader reads as 50", () => {
  it("puts the day's best AI score on exactly HALF_WEIGHT, always", () => {
    for (const best of [2, 5, AI_SCORE_MAX]) {
      const scored = scoreDay([
        judged({ photoId: 1, aiScore: best }),
        judged({ photoId: 2, aiScore: 1 }),
      ]);
      expect(forPhoto(scored, 1).aiNorm).toBe(HALF_WEIGHT);
    }
  });

  it("gives every snap the same AI half when the model scored them all alike", () => {
    const same = [5, 5, 5];
    const scored = scoreDay(
      same.map((aiScore, index) =>
        judged({
          photoId: index + 1,
          aiScore,
          ranksReceived: [1, 1, 1].slice(index),
        }),
      ),
    );

    for (const one of scored) expect(one.aiNorm).toBeCloseTo(normAt(2, 3));
    expect(scored.map((one) => one.photoId)).toEqual([1, 2, 3]);
    expect(scored.map((one) => one.rank)).toEqual([1, 2, 3]);
    expect(forPhoto(scored, 1).peerNorm).toBeGreaterThan(
      forPhoto(scored, 2).peerNorm,
    );
  });
});

describe("a snap the jury never scored", () => {
  it("stands in the middle of the field, whichever way the score went missing", () => {
    const field = 6;
    const scored = scoreDay([
      judged({ photoId: 1, aiScore: 10 }),
      judged({ photoId: 2, aiScore: 9 }),
      judged({ photoId: 3, aiScore: 8 }),
      judged({ photoId: 4, aiScore: 7 }),
      entry({ photoId: 5, aiScore: 5, aiStatus: "failed" }),
      entry({ photoId: 6 }),
    ]);
    const failed = forPhoto(scored, 5);
    const missing = forPhoto(scored, 6);
    expect(failed.aiNorm).toBeCloseTo(normAt((field + 1) / 2, field));
    expect(missing.aiNorm).toBe(failed.aiNorm);
    expect(failed.aiNorm).toBeLessThan(forPhoto(scored, 3).aiNorm);
    expect(failed.aiNorm).toBeGreaterThan(forPhoto(scored, 4).aiNorm);
  });

  it("does not let upload time decide a day the jury could not reach at all", () => {
    const scored = scoreDay(
      [100, 400, 200, 300].map((createdAt, index) =>
        entry({
          photoId: index + 1,
          aiScore: 5,
          aiStatus: "failed",
          createdAt,
        }),
      ),
    );
    expect(new Set(scored.map((one) => one.aiNorm)).size).toBe(1);
    expect(new Set(scored.map((one) => one.total)).size).toBe(1);
    expect(scored.map((one) => one.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe("a position beats a curve", () => {
  it("lets a snap nobody voted for win the day the jury ranked it first", () => {
    const field = 14;
    const peerFavourite = judged({
      photoId: 1,
      ranksReceived: [1, 1, 1],
      aiScore: 1,
    });
    const alsoVotedFor = [2, 3, 4, 5, 6, 7].map((photoId) =>
      judged({ photoId, ranksReceived: [1], aiScore: 3 }),
    );
    const unvoted = [8, 9, 10, 11, 12, 13, 14].map((photoId) =>
      judged({ photoId, aiScore: photoId === 8 ? AI_SCORE_MAX : 8 }),
    );
    const scored = scoreDay([peerFavourite, ...alsoVotedFor, ...unvoted]);
    expect(scored).toHaveLength(field);

    const juryPick = forPhoto(scored, 8);
    const favourite = forPhoto(scored, 1);
    expect(juryPick.peerPoints).toBe(0);
    expect(favourite.peerNorm).toBeCloseTo(HALF_WEIGHT);
    expect(juryPick.aiNorm).toBeCloseTo(HALF_WEIGHT);
    expect(juryPick.total).toBeGreaterThan(favourite.total);
    expect(juryPick.rank).toBe(1);
    expect(scored.filter((one) => one.rank === 1)).toHaveLength(1);
  });
});
