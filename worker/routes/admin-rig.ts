import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { prizes, riggedDays, users } from "../../db/schema";
import { riggedDaysSchema, setDaySchema, setRigSchema } from "../../shared/api";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../lib/db";
import { parseJsonBody } from "../lib/http";

export const adminRigRoutes = new Hono<AppEnv>();

const NOT_A_DAY = "A day is a whole number, 1 or more";

/** Inner-joined to `prizes`, so a rig whose prize row was deleted lists as no rig —
 * the same answer the landing gives it. */
async function riggedDayList(db: Db) {
  const rows = await db
    .select({
      day: riggedDays.day,
      prizeId: prizes.id,
      label: prizes.label,
      set: prizes.prizeSet,
      id: users.id,
      name: users.name,
    })
    .from(riggedDays)
    .innerJoin(prizes, eq(prizes.id, riggedDays.prizeId))
    .innerJoin(users, eq(users.id, riggedDays.riggedBy))
    .orderBy(asc(riggedDays.day));
  return riggedDaysSchema.parse({
    days: rows.map((row) => ({
      day: row.day,
      prize: { id: row.prizeId, label: row.label, set: row.set },
      riggedBy: { id: row.id, name: row.name },
    })),
  });
}

adminRigRoutes.get("/", async (c) => {
  return c.json(await riggedDayList(getDb(c.env)));
});

adminRigRoutes.post("/", async (c) => {
  const asked = setRigSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!asked.success) {
    return c.json({ error: `${NOT_A_DAY}, and a prize is a row` }, 400);
  }
  const db = getDb(c.env);
  const { day, prizeId } = asked.data;
  const found = await db
    .select({ id: prizes.id })
    .from(prizes)
    .where(eq(prizes.id, prizeId))
    .limit(1);
  if (found.length === 0) {
    return c.json({ error: "No such prize" }, 404);
  }
  const riggedBy = c.get("user").id;
  await db
    .insert(riggedDays)
    .values({ day, prizeId, riggedBy, createdAt: new Date() })
    .onConflictDoUpdate({
      target: riggedDays.day,
      set: { prizeId, riggedBy, createdAt: new Date() },
    });
  return c.json(await riggedDayList(db));
});

adminRigRoutes.delete("/:day", async (c) => {
  const asked = setDaySchema.safeParse({ day: Number(c.req.param("day")) });
  if (!asked.success) {
    return c.json({ error: NOT_A_DAY }, 400);
  }
  const db = getDb(c.env);
  await db.delete(riggedDays).where(eq(riggedDays.day, asked.data.day));
  return c.json(await riggedDayList(db));
});
