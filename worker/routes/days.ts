import { Hono } from "hono";
import { z } from "zod";
import { archiveSchema, dayResultsSchema } from "../../shared/api";
import type { AppEnv } from "../env";
import { awardsForDays, resultsForDays } from "../lib/day-results";
import { getDb } from "../lib/db";
import { isDayRevealed, readGameState, revealedDays } from "../lib/game-state";

export const daysRoutes = new Hono<AppEnv>();

const daySchema = z.coerce.number().int().positive();

daysRoutes.get("/", async (c) => {
  const db = getDb(c.env);
  const days = revealedDays(await readGameState(db));
  const byDay = await resultsForDays(db, days);
  const awards = await awardsForDays(db, days);
  return c.json(
    archiveSchema.parse({
      days: days
        .map((day) => ({
          day,
          results: byDay.get(day) ?? [],
          prize: awards.get(day) ?? null,
        }))
        .reverse(),
    }),
  );
});

daysRoutes.get("/:day/results", async (c) => {
  const asked = daySchema.safeParse(c.req.param("day"));
  if (!asked.success) {
    return c.json({ error: "Not found" }, 404);
  }
  const day = asked.data;
  const db = getDb(c.env);
  if (!isDayRevealed(day, await readGameState(db))) {
    return c.json({ error: "That day has not been revealed yet" }, 403);
  }

  const byDay = await resultsForDays(db, [day]);
  return c.json(dayResultsSchema.parse({ day, results: byDay.get(day) ?? [] }));
});
