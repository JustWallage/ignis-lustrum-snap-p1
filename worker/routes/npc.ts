import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { users } from "../../db/schema";
import {
  NPC_NAMES,
  npcChatRequestSchema,
  npcChatResponseSchema,
  recentTurns,
} from "../../shared/npc";
import type { AppEnv, Bindings } from "../env";
import { getDb } from "../lib/db";
import { parseJsonBody } from "../lib/http";
import { npcRateLimit, npcTurn, saidAsTurn, type NpcWorld } from "../lib/npc";
import { tripDay } from "../lib/trip";

/**
 * The names, from the table that says who actually exists. NOT from `USERS_JSON`,
 * which is a credential blob: the passwords never come near the prompt builder if the
 * builder cannot reach them. A world nobody can read leaves them exactly as they were.
 */
async function world(env: Bindings): Promise<NpcWorld> {
  const day = tripDay(Date.now());
  try {
    const rows = await getDb(env)
      .select({ name: users.name })
      .from(users)
      .orderBy(asc(users.name));
    return { roster: rows.map((row) => row.name), day };
  } catch {
    return { roster: [], day };
  }
}

// Nothing is stored: the transcript arrives in the request and is handed straight
// back, so there is no history for a later request to disagree with.
export const npcRoutes = new Hono<AppEnv>();

npcRoutes.post("/chat", async (c) => {
  const asked = npcChatRequestSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!asked.success) {
    // Includes a transcript trying to carry a `system` role, an unknown `who` and an
    // over-long typed answer: all refused by PARSING, so none reaches the model.
    return c.json({ error: "That is not something to say" }, 400);
  }
  const who = asked.data.who;
  // Per user rather than per socket or IP: the budget belongs to whoever spends it.
  // After the parse and before the model, which is where a loop costs something.
  if (!npcRateLimit.allow(String(c.get("user").id))) {
    return c.json(
      { error: `${NPC_NAMES[who]} needs a moment. Try again shortly.` },
      429,
    );
  }

  const history = recentTurns([
    ...asked.data.turns,
    { role: "player", text: asked.data.message },
  ]);
  // A picked option and a typed sentence are the same thing by the time they arrive:
  // there is no second conversation mode.
  const said = await npcTurn(c.env, who, history, await world(c.env));
  return c.json(
    npcChatResponseSchema.parse({
      ...said,
      // The reaction and question as ONE line, which is what an `npc` turn is. The
      // options are for the player to press, not part of what he remembers saying.
      turns: recentTurns([...history, { role: "npc", text: saidAsTurn(said) }]),
    }),
  );
});
