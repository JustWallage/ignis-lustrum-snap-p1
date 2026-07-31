import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { leaderboardSchema } from "../../shared/api";
import { app } from "../index";
import {
  getJson,
  resetWorld,
  setDay,
  signIn,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

describe("the cumulative leaderboard", () => {
  const BOARD = "/api/leaderboard";

  async function standings(cookie: string) {
    return leaderboardSchema.parse(await getJson(BOARD, cookie)).standings;
  }

  const SEEDED = ["tester", "rival", "voter", "judge"];

  it("puts the whole group on the table, on zero, before anything is revealed", async () => {
    const cookie = await signIn();
    await signIn("rival");
    await signIn("voter");
    await uploadPhotoId(cookie);

    const table = await standings(cookie);
    expect(table.map((one) => one.user.name).sort()).toEqual(SEEDED.sort());
    expect(table.every((one) => one.total === 0)).toBe(true);
    expect(table.every((one) => one.entries === 0)).toBe(true);
    expect(table.map((one) => one.rank)).toEqual(
      SEEDED.map((_unused, index) => index + 1),
    );
  });

  it("counts a day once it is over, and only then", async () => {
    const mine = await signIn();
    const theirs = await signIn("rival");
    await signIn("voter");
    await uploadPhotoId(mine);
    await uploadPhotoId(theirs);
    try {
      await setDay(2);
      const table = await standings(mine);
      const played = table.filter((one) => one.entries > 0);
      expect(played.map((one) => one.user.name).sort()).toEqual([
        "rival",
        "tester",
      ]);
      expect(table.reduce((sum, one) => sum + one.wins, 0)).toBe(1);
      expect(table[0]?.rank).toBe(1);
      expect(table[0]?.wins).toBe(1);
      const voter = table.find((one) => one.user.name === "voter");
      expect(voter?.total).toBe(0);
      expect(voter?.entries).toBe(0);
    } finally {
      await setDay(1);
    }
  });

  it("adds the days up rather than re-scoring them", async () => {
    const mine = await signIn();
    const theirs = await signIn("rival");
    await uploadPhotoId(mine);
    try {
      await setDay(2);
      await uploadPhotoId(theirs);
      await setDay(3);

      const table = await standings(mine);
      const players = table.filter((one) => one.entries > 0);
      expect(players).toHaveLength(2);
      expect(players.every((one) => one.wins === 1)).toBe(true);
      expect(players.every((one) => one.entries === 1)).toBe(true);
      const [first, second] = players;
      expect(first?.total).toBe(second?.total);
      expect(first?.total).toBeGreaterThan(0);
    } finally {
      await setDay(1);
    }
  });

  it("stays behind the session cookie, like every other scoreboard", async () => {
    expect((await app.request(BOARD, {}, env)).status).toBe(401);
  });
});
