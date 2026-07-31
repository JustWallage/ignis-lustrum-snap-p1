import { describe, expect, it } from "vitest";
import {
  AI_SCORE_MAX,
  BONUS_POINTS,
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
    bonusDetected: false,
    uploaderVoted: true,
    createdAt: 0,
    ...overrides,
  };
}

function forPhoto(scored: ReturnType<typeof scoreDay>, photoId: number) {
  const found = scored.find((one) => one.photoId === photoId);
  if (found === undefined) throw new Error(`photo ${photoId} was not scored`);
  return found;
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
  it("gives a lone submission both halves and rank 1", () => {
    // Nobody to vote for it, so its own zero is also the day's best: curving
    // against zero must read as 0, not NaN.
    const [only] = scoreDay([entry({ photoId: 7, aiScore: 4 })]);
    expect(only).toEqual({
      photoId: 7,
      peerPoints: 0,
      peerNorm: 0,
      aiNorm: HALF_WEIGHT,
      bonus: false,
      penalised: false,
      total: HALF_WEIGHT,
      rank: 1,
    });
  });

  it("scores an empty day as nothing at all", () => {
    expect(scoreDay([])).toEqual([]);
  });

  it("zeroes the peer half when nobody voted on anything", () => {
    const scored = scoreDay([
      entry({ photoId: 1, aiScore: 8 }),
      entry({ photoId: 2, aiScore: 4 }),
    ]);
    for (const one of scored) {
      expect(one.peerPoints).toBe(0);
      expect(one.peerNorm).toBe(0);
    }
    expect(forPhoto(scored, 1).total).toBe(HALF_WEIGHT);
    expect(forPhoto(scored, 2).total).toBe(HALF_WEIGHT / 2);
    expect(scored.map((one) => one.photoId)).toEqual([1, 2]);
  });

  it("flattens the AI half when every evaluation failed the same way", () => {
    const scored = scoreDay([
      entry({ photoId: 1, aiScore: 5, ranksReceived: [1] }),
      entry({ photoId: 2, aiScore: 5 }),
    ]);
    for (const one of scored) expect(one.aiNorm).toBe(HALF_WEIGHT);
    expect(forPhoto(scored, 1).total).toBe(HALF_WEIGHT * 2);
    expect(forPhoto(scored, 2).total).toBe(HALF_WEIGHT);
  });

  it("gives the AI half nothing when no evaluation ever landed", () => {
    // aiScore 0 is "no row at all", which is not a score of zero out of ten —
    // it simply contributes nothing, and cannot make the day's best a zero
    // divisor for everyone else.
    const scored = scoreDay([
      entry({ photoId: 1, ranksReceived: [1] }),
      entry({ photoId: 2, aiScore: 6 }),
    ]);
    expect(forPhoto(scored, 1).aiNorm).toBe(0);
    expect(forPhoto(scored, 2).aiNorm).toBe(HALF_WEIGHT);
  });

  it("weighs the peer and AI leaders exactly the same", () => {
    const scored = scoreDay([
      entry({ photoId: 1, ranksReceived: [1, 1, 1], aiScore: 1 }),
      entry({ photoId: 2, aiScore: 10 }),
    ]);
    const peerLeader = forPhoto(scored, 1);
    const aiLeader = forPhoto(scored, 2);
    expect(peerLeader.peerNorm).toBe(HALF_WEIGHT);
    expect(aiLeader.aiNorm).toBe(HALF_WEIGHT);
    expect(peerLeader.peerNorm).toBe(aiLeader.aiNorm);
    expect(peerLeader.total).toBeCloseTo(HALF_WEIGHT + HALF_WEIGHT / 10);
    expect(aiLeader.total).toBe(HALF_WEIGHT);
  });

  it("curves the peer half against the day's best, not a theoretical maximum", () => {
    const scored = scoreDay([
      entry({ photoId: 1, ranksReceived: [1, 2] }),
      entry({ photoId: 2, ranksReceived: [3] }),
    ]);
    expect(forPhoto(scored, 1).peerPoints).toBe(5);
    expect(forPhoto(scored, 1).peerNorm).toBe(HALF_WEIGHT);
    expect(forPhoto(scored, 2).peerNorm).toBeCloseTo(HALF_WEIGHT / 5);
  });

  it("adds the bonus on top of both halves", () => {
    const scored = scoreDay([
      entry({ photoId: 1, aiScore: 5, bonusDetected: true }),
      entry({ photoId: 2, aiScore: 5 }),
    ]);
    expect(forPhoto(scored, 1).bonus).toBe(true);
    expect(forPhoto(scored, 1).total).toBe(HALF_WEIGHT + BONUS_POINTS);
    expect(forPhoto(scored, 2).total).toBe(HALF_WEIGHT);
  });

  it("halves the total of somebody who voted for nobody, after the bonus", () => {
    const scored = scoreDay([
      entry({
        photoId: 1,
        aiScore: 5,
        bonusDetected: true,
        uploaderVoted: false,
      }),
      entry({ photoId: 2, aiScore: 5, bonusDetected: true }),
    ]);
    const freeloader = forPhoto(scored, 1);
    expect(freeloader.penalised).toBe(true);
    // Halving after the bonus, so the ten points are halved too. Applying the
    // penalty first would have left 25 + 10 = 35.
    expect(freeloader.total).toBe((HALF_WEIGHT + BONUS_POINTS) / 2);
    expect(freeloader.total).toBe(
      (HALF_WEIGHT + BONUS_POINTS) * NO_VOTE_MULTIPLIER,
    );
    expect(forPhoto(scored, 2).penalised).toBe(false);
    expect(scored.map((one) => one.photoId)).toEqual([2, 1]);
  });

  it("still reports the halves it earned before the penalty took the total", () => {
    const [only] = scoreDay([
      entry({ photoId: 1, aiScore: 5, uploaderVoted: false }),
    ]);
    expect(only?.aiNorm).toBe(HALF_WEIGHT);
    expect(only?.total).toBe(HALF_WEIGHT * NO_VOTE_MULTIPLIER);
  });

  it("breaks a three-way tie on the AI score, then on who uploaded first", () => {
    const scored = scoreDay([
      entry({ photoId: 1, ranksReceived: [1], aiScore: 5, createdAt: 300 }),
      entry({ photoId: 2, ranksReceived: [1], aiScore: 7, createdAt: 200 }),
      entry({ photoId: 3, ranksReceived: [1], aiScore: 5, createdAt: 100 }),
    ]);
    for (const one of scored) expect(one.peerNorm).toBe(HALF_WEIGHT);
    expect(scored.map((one) => one.photoId)).toEqual([2, 3, 1]);
    expect(scored.map((one) => one.rank)).toEqual([1, 2, 3]);
    expect(forPhoto(scored, 3).total).toBe(forPhoto(scored, 1).total);
  });

  it("ranks a dead heat by upload time when nothing else separates it", () => {
    const scored = scoreDay([
      entry({ photoId: 1, ranksReceived: [2], aiScore: 6, createdAt: 900 }),
      entry({ photoId: 2, ranksReceived: [2], aiScore: 6, createdAt: 100 }),
      entry({ photoId: 3, ranksReceived: [2], aiScore: 6, createdAt: 500 }),
    ]);
    const totals = new Set(scored.map((one) => one.total));
    expect(totals.size).toBe(1);
    expect(scored.map((one) => one.photoId)).toEqual([2, 3, 1]);
  });

  it("numbers the ranks 1..n with no gaps and no shared places", () => {
    const scored = scoreDay([
      entry({ photoId: 1, ranksReceived: [1], aiScore: 9 }),
      entry({ photoId: 2, aiScore: 9 }),
      entry({ photoId: 3, ranksReceived: [2], aiScore: 1 }),
      entry({ photoId: 4, aiScore: 9, bonusDetected: true }),
    ]);
    expect(scored.map((one) => one.rank)).toEqual([1, 2, 3, 4]);
    expect(scored.map((one) => one.photoId)).toEqual([1, 4, 2, 3]);
  });

  it("leaves the day it was handed alone", () => {
    const entries = [
      entry({ photoId: 2, aiScore: 1, createdAt: 5 }),
      entry({ photoId: 1, aiScore: 9 }),
    ];
    const snapshot = structuredClone(entries);
    scoreDay(entries);
    expect(entries).toEqual(snapshot);
  });
});

// The two properties everybody misreads as a bug, pinned so nobody "fixes" them:
// `aiNorm` is 0..HALF_WEIGHT measured against the DAY, not a rating out of ten.
describe("the AI curve, and why it reads as 50", () => {
  it("curves the day's best AI score to exactly HALF_WEIGHT, always", () => {
    for (const best of [1, 5, AI_SCORE_MAX]) {
      const scored = scoreDay([
        entry({ photoId: 1, aiScore: best }),
        entry({ photoId: 2, aiScore: 1 }),
      ]);
      expect(forPhoto(scored, 1).aiNorm).toBe(HALF_WEIGHT);
    }
  });

  it("gives every snap HALF_WEIGHT when the model scored them all the same", () => {
    const same = [5, 5, 5];
    const scored = scoreDay(
      same.map((aiScore, index) =>
        entry({
          photoId: index + 1,
          aiScore,
          ranksReceived: [1, 1, 1].slice(index),
        }),
      ),
    );

    for (const one of scored) expect(one.aiNorm).toBe(HALF_WEIGHT);
    expect(scored.map((one) => one.photoId)).toEqual([1, 2, 3]);
    expect(scored.map((one) => one.rank)).toEqual([1, 2, 3]);
    expect(forPhoto(scored, 1).peerNorm).toBeGreaterThan(
      forPhoto(scored, 2).peerNorm,
    );
  });

  it("gives a snap with no evaluation nothing, rather than borrowing a number", () => {
    const scored = scoreDay([
      entry({ photoId: 1, aiScore: AI_SCORE_MAX }),
      entry({ photoId: 2, aiScore: 0 }),
    ]);
    expect(forPhoto(scored, 2).aiNorm).toBe(0);
  });
});
