import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { bowserDays, users } from "../../db/schema";
import { bowserDaysSchema, setDaySchema } from "../../shared/api";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../lib/db";
import { parseJsonBody } from "../lib/http";

export const adminBowserRoutes = new Hono<AppEnv>();

async function markedDays(db: Db) {
  const rows = await db
    .select({
      day: bowserDays.day,
      id: users.id,
      name: users.name,
    })
    .from(bowserDays)
    .innerJoin(users, eq(users.id, bowserDays.markedBy))
    .orderBy(asc(bowserDays.day));
  return bowserDaysSchema.parse({
    days: rows.map((row) => ({
      day: row.day,
      markedBy: { id: row.id, name: row.name },
    })),
  });
}

adminBowserRoutes.get("/", async (c) => {
  return c.json(await markedDays(getDb(c.env)));
});

adminBowserRoutes.post("/", async (c) => {
  const asked = setDaySchema.safeParse(await parseJsonBody(c.req.raw));
  if (!asked.success) {
    return c.json({ error: "A day is a whole number, 1 or more" }, 400);
  }
  const db = getDb(c.env);
  await db
    .insert(bowserDays)
    .values({
      day: asked.data.day,
      markedBy: c.get("user").id,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  return c.json(await markedDays(db));
});

adminBowserRoutes.delete("/:day", async (c) => {
  const asked = setDaySchema.safeParse({ day: Number(c.req.param("day")) });
  if (!asked.success) {
    return c.json({ error: "A day is a whole number, 1 or more" }, 400);
  }
  const db = getDb(c.env);
  await db.delete(bowserDays).where(eq(bowserDays.day, asked.data.day));
  return c.json(await markedDays(db));
});
