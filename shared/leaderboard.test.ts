import { describe, expect, it } from "vitest";
import { rankStandings, type Contestant, type DayPlacing } from "./leaderboard";

const FRIENDS: Contestant[] = [
  { id: 1, name: "ada" },
  { id: 2, name: "bo" },
  { id: 3, name: "cy" },
];

function placed(userId: number, rank: number, total: number): DayPlacing {
  return { userId, rank, total };
}

describe("rankStandings", () => {
  it("adds the revealed days up and counts the wins", () => {
    const table = rankStandings(FRIENDS, [
      placed(1, 1, 90),
      placed(2, 2, 60),
      placed(2, 1, 80),
      placed(1, 2, 75),
    ]);

    expect(table.map((row) => row.name)).toEqual(["ada", "bo", "cy"]);
    expect(table.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(table.map((row) => row.total)).toEqual([165, 140, 0]);
    expect(table.map((row) => row.wins)).toEqual([1, 1, 0]);
    expect(table.map((row) => row.entries)).toEqual([2, 2, 0]);
  });

  it("keeps somebody who never submitted on the table, on zero", () => {
    const table = rankStandings(FRIENDS, [placed(1, 1, 50)]);

    const cy = table.find((row) => row.name === "cy");
    expect(cy).toEqual({
      id: 3,
      name: "cy",
      total: 0,
      wins: 0,
      entries: 0,
      rank: 3,
    });
    expect(table).toHaveLength(FRIENDS.length);
  });

  it("breaks a tie on wins, and then on the alphabet", () => {
    const onWins = rankStandings(FRIENDS, [
      placed(1, 2, 100),
      placed(2, 1, 100),
    ]);
    expect(onWins.map((row) => row.name)).toEqual(["bo", "ada", "cy"]);

    const onNothing = rankStandings(FRIENDS, []);
    expect(onNothing.map((row) => row.name)).toEqual(["ada", "bo", "cy"]);
    expect(onNothing.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it("ignores a placing for somebody who is not a contestant", () => {
    const table = rankStandings(FRIENDS, [
      placed(99, 1, 100),
      placed(1, 2, 10),
    ]);
    expect(table.map((row) => row.name)).toEqual(["ada", "bo", "cy"]);
    expect(table[0]?.total).toBe(10);
  });

  it("has nothing to say about nobody", () => {
    expect(rankStandings([], [])).toEqual([]);
  });
});
