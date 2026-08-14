import { gte } from "drizzle-orm";
import { Hono } from "hono";
import { prizeAwards } from "../../db/schema";
import { clockSchema, setDaySchema } from "../../shared/api";
import { isEventRunning } from "../../shared/events";
import type { AppEnv } from "../env";
import { pushGameState } from "../lib/broadcast";
import { getDb } from "../lib/db";
import { readEventState } from "../lib/event";
import { readGameState, setGameDayStatement } from "../lib/game-state";
import { parseJsonBody } from "../lib/http";

export const adminClockRoutes = new Hono<AppEnv>();

export const EVENT_IS_LIVE =
  "The live event is running. Abort it before moving the clock.";

adminClockRoutes.post("/", async (c) => {
  const asked = setDaySchema.safeParse(await parseJsonBody(c.req.raw));
  if (!asked.success) {
    return c.json({ error: "A day is a whole number, 1 or more" }, 400);
  }
  if (isEventRunning(await readEventState(c.env))) {
    return c.json({ error: EVENT_IS_LIVE }, 409);
  }
  const db = getDb(c.env);
  const { day } = asked.data;
  const [dropped] = await db.batch([
    db
      .delete(prizeAwards)
      .where(gte(prizeAwards.day, day))
      .returning({ day: prizeAwards.day }),
    setGameDayStatement(db, day),
  ]);
  const state = await readGameState(db);
  await pushGameState(c.env, state);
  return c.json(clockSchema.parse({ ...state, awardsDropped: dropped.length }));
});
