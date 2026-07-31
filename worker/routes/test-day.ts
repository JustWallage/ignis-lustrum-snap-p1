import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { getDb } from "../lib/db";
import { setEventPhase } from "../lib/event";
import { readGameState, setGameDay } from "../lib/game-state";
import { parseJsonBody } from "../lib/http";

// A revealed day a spec can still WALK AROUND IN: the wheel's landing produces one but
// costs a whole event, and `/api/test/reset` moves the day by emptying the world.
export const testDayRoute = new Hono<AppEnv>();

const daySchema = z.object({ day: z.int().positive() });

testDayRoute.post("/", async (c) => {
  const parsed = daySchema.safeParse(await parseJsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: "Not a day" }, 400);

  const db = getDb(c.env);
  await setGameDay(db, parsed.data.day);
  await setEventPhase(c.env, "submission");
  return c.json(await readGameState(db));
});
