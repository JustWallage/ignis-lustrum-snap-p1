import { Hono } from "hono";
import { users } from "../../db/schema";
import { leaderboardSchema } from "../../shared/api";
import { rankStandings, type DayPlacing } from "../../shared/leaderboard";
import type { AppEnv } from "../env";
import { resultsForDays } from "../lib/day-results";
import { getDb } from "../lib/db";
import { readGameState, revealedDays } from "../lib/game-state";
import { toStanding } from "../lib/serialize";

export const leaderboardRoutes = new Hono<AppEnv>();

leaderboardRoutes.get("/", async (c) => {
  const db = getDb(c.env);
  const days = revealedDays(await readGameState(db));
  const byDay = await resultsForDays(db, days);

  const placings: DayPlacing[] = [...byDay.values()].flatMap((results) =>
    results.map((result) => ({
      userId: result.uploader.id,
      total: result.total,
      rank: result.rank,
    })),
  );

  const everyone = await db
    .select({ id: users.id, name: users.name })
    .from(users);

  return c.json(
    leaderboardSchema.parse({
      standings: rankStandings(everyone, placings).map(toStanding),
    }),
  );
});
