import { describe, expect, it } from "vitest";
import {
  CROWD_FIGURE_W,
  crowdLayout,
  crowdOf,
  wornBy,
  type CrowdPlayer,
  type CrowdSpot,
} from "@/game/crowd";

const TOWN = 14;

function widthOf(spot: CrowdSpot): number {
  return CROWD_FIGURE_W * spot.scale;
}

function overlap(a: CrowdSpot, b: CrowdSpot): boolean {
  return Math.abs(a.x - b.x) < (widthOf(a) + widthOf(b)) / 2;
}

function town(count: number): CrowdPlayer[] {
  return Array.from({ length: count }, (_, at) => ({
    id: at + 1,
    name: `friend-${String(at + 1)}`,
    url: at % 2 === 0 ? `/api/sprites/${String(at)}` : null,
  }));
}

describe("crowdLayout", () => {
  it("puts nobody anywhere for an empty town", () => {
    expect(crowdLayout(0, 1)).toEqual([]);
  });

  it("stands every player once, wherever the town's size lands", () => {
    for (const count of [1, 2, 4, 7, TOWN, 24]) {
      const members = crowdLayout(count, count * 7).map((spot) => spot.member);
      expect([...members].sort((a, b) => a - b)).toEqual(
        Array.from({ length: count }, (_, at) => at),
      );
    }
  });

  it("is a group and not a row: two scales, and one figure in front of another", () => {
    for (let count = 2; count <= 24; count += 1) {
      const spots = crowdLayout(count, count * 3);
      expect(
        new Set(spots.map((spot) => spot.scale)).size,
        `${String(count)}: two distances from the camera`,
      ).toBeGreaterThan(1);
      const hidden = spots.some((behind, at) =>
        spots
          .slice(at + 1)
          .some(
            (front) => front.scale > behind.scale && overlap(behind, front),
          ),
      );
      expect(hidden, `${String(count)}: somebody stands in front`).toBe(true);
    }
  });

  it("hands them back in painting order, furthest away first", () => {
    const spots = crowdLayout(TOWN, 3);
    for (const [at, spot] of spots.entries()) {
      const behind = spots[at - 1];
      if (behind === undefined) continue;
      expect(spot.scale).toBeGreaterThanOrEqual(behind.scale);
      expect(spot.depth).toBeGreaterThanOrEqual(behind.depth);
    }
  });

  it("keeps the whole crowd inside the box it is drawn in", () => {
    for (let count = 1; count <= 24; count += 1) {
      for (const spot of crowdLayout(count, count)) {
        expect(spot.x - widthOf(spot) / 2).toBeGreaterThanOrEqual(0);
        expect(spot.x + widthOf(spot) / 2).toBeLessThanOrEqual(1);
      }
    }
  });

  it("shoulder to shoulder, never one inside another, however big the town", () => {
    for (let count = 2; count <= 24; count += 1) {
      const spots = crowdLayout(count, count * 5);
      for (const [at, spot] of spots.entries()) {
        const beside = spots[at - 1];
        if (beside?.scale !== spot.scale) continue;
        expect(
          spot.x - beside.x,
          `${String(count)}: two of them in one place`,
        ).toBeGreaterThan(widthOf(spot) / 2);
      }
    }
  });

  it("holds still for one seed and moves for the next", () => {
    expect(crowdLayout(TOWN, 12)).toEqual(crowdLayout(TOWN, 12));
    expect(crowdLayout(TOWN, 12)).not.toEqual(crowdLayout(TOWN, 13));
  });
});

describe("crowdOf", () => {
  it("dresses each place in the player the seed sent there", () => {
    const roster = town(TOWN);
    const crowd = crowdOf(roster, 5);
    expect(crowd).toHaveLength(TOWN);
    for (const member of crowd) {
      const who = roster[member.member];
      expect(member.id).toBe(who?.id);
      expect(member.name).toBe(who?.name);
      expect(member.url).toBe(who?.url);
    }
  });

  it("stands a player who has never been drawn there anyway", () => {
    const undrawn = crowdOf(town(TOWN), 5).filter(
      (member) => member.url === null,
    );
    expect(undrawn.length).toBe(TOWN / 2);
  });

  it("sends two different seeds to two different crowds", () => {
    const order = (seed: number) =>
      crowdOf(town(TOWN), seed).map((member) => member.name);
    expect(order(1)).not.toEqual(order(2));
  });
});

describe("wornBy", () => {
  it("finds what that player has on, and nothing for a stranger", () => {
    const roster = town(4);
    expect(wornBy(roster, 1)).toBe("/api/sprites/0");
    expect(wornBy(roster, 2)).toBeNull();
    expect(wornBy(roster, 99)).toBeNull();
  });
});
