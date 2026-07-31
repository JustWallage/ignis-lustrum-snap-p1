import { Hono } from "hono";
import { z } from "zod";
import { gamePhaseSchema } from "../../shared/state";
import type { AppEnv } from "../env";
import { getDb } from "../lib/db";
import { setEventPhase } from "../lib/event";
import { readGameState } from "../lib/game-state";
import { parseJsonBody } from "../lib/http";

// Carries NONE of the state a real transition would, which is why a countdown reached
// this way has no target to count. Asks the DO rather than writing `game_state.phase`:
// reaching around the single writer leaves the two disagreeing.
export const testPhaseRoute = new Hono<AppEnv>();

const phaseSchema = z.object({ phase: gamePhaseSchema });

testPhaseRoute.post("/", async (c) => {
  const parsed = phaseSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: "Unknown phase" }, 400);

  await setEventPhase(c.env, parsed.data.phase);
  return c.json(await readGameState(getDb(c.env)));
});
