import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { avatarGenerations } from "../../db/schema";
import type { AppEnv } from "../env";
import { AVATAR_DAILY_LIMIT } from "../lib/avatar-caps";
import { getDb } from "../lib/db";
import { readGameState } from "../lib/game-state";
import { parseJsonBody } from "../lib/http";
import { z } from "zod";

// Every generation refuses AND refunds without a key, so "out of ink" is unreachable by
// playing — and the artist's refusal has to happen BEFORE a picker opens. Writes the
// same row through the same index `generateAvatar` reads.
export const testQuotaRoute = new Hono<AppEnv>();

// Bounded by the SEED default rather than the stored cap: this schema is built once at
// module scope, where no D1 read is possible, and the seed is what every e2e database
// opens on — so the bound stays honest for the specs that drive this route.
const quotaSchema = z.object({
  used: z.int().min(0).max(AVATAR_DAILY_LIMIT),
});

testQuotaRoute.post("/", async (c) => {
  const asked = quotaSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!asked.success) {
    return c.json({ error: "That is not a number of generations" }, 400);
  }
  const db = getDb(c.env);
  const { day } = await readGameState(db);
  await db
    .insert(avatarGenerations)
    .values({
      userId: c.get("user").id,
      day,
      used: asked.data.used,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [avatarGenerations.userId, avatarGenerations.day],
      set: { used: sql`excluded.used`, updatedAt: new Date() },
    });
  return c.json({ ok: true });
});
