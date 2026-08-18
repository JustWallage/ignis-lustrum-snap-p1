import { describe, expect, it } from "vitest";
import { MAX_PICKS } from "@shared/api";
import { NO_VOTE_MULTIPLIER } from "@shared/scoring";
import {
  ballotText,
  noVoteWarning,
  podium,
  rankLabel,
  rankOf,
  RANKS,
  sameBallot,
  slotState,
  tapRank,
  type Picks,
} from "@/lib/ballot";

function tap(picks: Picks, id: number, rank: number) {
  return tapRank(picks, { id, rank, rankable: true });
}

/**
 * The invariant every result has to satisfy: no duplicates, never longer than
 * the ballot has ranks, and — since position IS the rank — ranks that run
 * 1..n with nothing missing in between.
 */
function expectContiguous(picks: readonly number[]): void {
  expect(new Set(picks).size).toBe(picks.length);
  expect(picks.length).toBeLessThanOrEqual(MAX_PICKS);
  expect(picks.map((id) => rankOf(picks, id))).toEqual(
    picks.map((_unused, index) => index + 1),
  );
}

describe("ballotText", () => {
  it("reads the counts back in the ballot's own words", () => {
    expect(ballotText([2, 1, 0])).toBe("2×1ST 1×2ND");
    expect(ballotText([0, 0, 3])).toBe("3×3RD");
  });

  it("says a snap nobody picked got no votes rather than printing noughts", () => {
    expect(ballotText([0, 0, 0])).toBe("NO VOTES");
    expect(ballotText([0, 0, 0])).not.toContain("0×");
  });
});

describe("the ranking rule", () => {
  it("has one slot per rank, named for the podium", () => {
    expect(RANKS).toEqual([1, 2, 3]);
    expect(RANKS.map(rankLabel)).toEqual(["1ST", "2ND", "3RD"]);
  });

  it("assigns an empty rank without touching the picks already made", () => {
    const { picks, note } = tap([10], 20, 2);
    expect(picks).toEqual([10, 20]);
    expect(note).toBeNull();
    expectContiguous(picks);
  });

  it("compacts a rank reached over an empty one, rather than leaving a hole", () => {
    const { picks } = tap([10], 20, 3);
    expect(picks).toEqual([10, 20]);
    expect(rankOf(picks, 20)).toBe(2);
    expectContiguous(picks);
  });

  it("takes a rank off another snap, and says so", () => {
    const { picks, note } = tap([10, 20, 30], 40, 2);
    expect(picks).toEqual([10, 40, 30]);
    expect(note).toBe("2ND MOVED FROM ANOTHER SNAP");
    expectContiguous(picks);
  });

  it("swaps two snaps when the one being ranked already holds a rank", () => {
    const { picks, note } = tap([10, 20, 30], 10, 3);
    expect(picks).toEqual([30, 20, 10]);
    expect(note).toBe("3RD MOVED FROM ANOTHER SNAP");
    expectContiguous(picks);
  });

  it("moves a snap up without dropping anybody when the target rank is free", () => {
    const { picks } = tap([10, 20], 20, 1);
    expect(picks).toEqual([20, 10]);
    expectContiguous(picks);
  });

  it("clears a rank when it is tapped a second time, closing the gap", () => {
    const { picks, note } = tap([10, 20, 30], 10, 1);
    expect(picks).toEqual([20, 30]);
    expect(note).toBeNull();
    expect(rankOf(picks, 20)).toBe(1);
    expectContiguous(picks);
  });

  it("leaves the ballot alone for a snap that may never hold a rank", () => {
    const before = [10, 20];
    for (const rank of RANKS) {
      const { picks, note } = tapRank(before, {
        id: 99,
        rank,
        rankable: false,
      });
      expect(picks).toEqual(before);
      expect(note).toBeNull();
      expectContiguous(picks);
    }
  });

  it("ignores a rank the ballot does not have", () => {
    expect(tap([10], 20, 0).picks).toEqual([10]);
    expect(tap([10], 20, MAX_PICKS + 1).picks).toEqual([10]);
  });

  it("keeps ranks contiguous however long the tapping goes on", () => {
    const ids = [10, 20, 30, 40, 50];
    let picks: number[] = [];
    for (let step = 0; step < ids.length * MAX_PICKS; step += 1) {
      const id = ids[(step * 3) % ids.length] ?? 0;
      const rank = RANKS[step % MAX_PICKS] ?? 1;
      picks = tap(picks, id, rank).picks;
      expectContiguous(picks);
    }
  });

  it("lays the podium out as one slot per rank, empty where nothing holds it", () => {
    expect(podium([10, 20])).toEqual([10, 20, null]);
    expect(podium([])).toEqual([null, null, null]);
  });

  it("compares ballots by order, not by membership", () => {
    expect(sameBallot([10, 20], [10, 20])).toBe(true);
    expect(sameBallot([10, 20], [20, 10])).toBe(false);
    expect(sameBallot([10], [10, 20])).toBe(false);
  });
});

describe("slotState", () => {
  it("tells a free slot from the one this snap holds from one spent elsewhere", () => {
    const picks = [10, 20];
    expect(RANKS.map((rank) => slotState(picks, rank, 10))).toEqual([
      "held",
      "taken",
      "free",
    ]);
    expect(RANKS.map((rank) => slotState(picks, rank, 20))).toEqual([
      "taken",
      "held",
      "free",
    ]);
  });

  it("calls every slot free for a snap on an empty ballot", () => {
    expect(RANKS.map((rank) => slotState([], rank, 10))).toEqual([
      "free",
      "free",
      "free",
    ]);
  });

  it("never calls a slot taken for the snap that holds it", () => {
    const picks = [10, 20, 30];
    for (const [index, id] of picks.entries()) {
      expect(slotState(picks, index + 1, id)).toBe("held");
    }
  });
});

describe("noVoteWarning", () => {
  it("says what today's multiplier actually costs", () => {
    expect(noVoteWarning(NO_VOTE_MULTIPLIER)).toContain("50%");
  });

  it("is built from the constant rather than typed out", () => {
    // The claim the ticket is really about: move the arithmetic and the sentence
    // moves with it, so the copy can never be quietly wrong about the rule.
    expect(noVoteWarning(0.25)).toContain("25%");
    expect(noVoteWarning(0.25)).not.toContain("50%");
    expect(noVoteWarning(0.1)).toContain("10%");
  });

  it("blames casting no votes at all, not casting fewer than three", () => {
    const said = noVoteWarning(NO_VOTE_MULTIPLIER);
    expect(said).toMatch(/one pick/i);
    expect(said).not.toMatch(/half|×0\.5|x0\.5/i);
  });
});
