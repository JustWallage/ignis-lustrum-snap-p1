import { asc, eq, max } from "drizzle-orm";
import { Hono } from "hono";
import { prizes } from "../../db/schema";
import {
  prizeCreateSchema,
  prizeListSchema,
  prizeUpdateSchema,
} from "../../shared/api";
import type { AppEnv } from "../env";
import { isAdmin } from "../lib/auth";
import { broadcast } from "../lib/broadcast";
import { getDb, type Db } from "../lib/db";
import { parseJsonBody } from "../lib/http";
import { toPrize } from "../lib/serialize";

export const prizesRoutes = new Hono<AppEnv>();

prizesRoutes.use(async (c, next) => {
  if (
    c.req.method !== "GET" &&
    !isAdmin(c.get("user").name, c.env.ADMIN_NAMES)
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return next();
});

/** `sort_order` is not unique, so `id` breaks the tie and the order is stable. */
function listPrizes(db: Db) {
  return db
    .select()
    .from(prizes)
    .orderBy(asc(prizes.sortOrder), asc(prizes.id));
}

async function findPrize(db: Db, id: number) {
  const rows = await db.select().from(prizes).where(eq(prizes.id, id)).limit(1);
  return rows[0] ?? null;
}

prizesRoutes.get("/", async (c) => {
  const rows = await listPrizes(getDb(c.env));
  return c.json(prizeListSchema.parse({ prizes: rows.map(toPrize) }));
});

prizesRoutes.post("/", async (c) => {
  const parsed = prizeCreateSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!parsed.success) {
    return c.json({ error: "A prize needs a label" }, 400);
  }
  const db = getDb(c.env);
  const highest = await db
    .select({ value: max(prizes.sortOrder) })
    .from(prizes);
  const inserted = await db
    .insert(prizes)
    .values({
      label: parsed.data.label,
      enabled: true,
      sortOrder: (highest[0]?.value ?? -1) + 1,
      createdAt: new Date(),
    })
    .returning();
  const row = inserted[0];
  if (row === undefined) {
    return c.json({ error: "Insert failed" }, 500);
  }
  await broadcast(c.env, { type: "prizes_changed" });
  return c.json(toPrize(row), 201);
});

prizesRoutes.patch("/:id", async (c) => {
  const parsed = prizeUpdateSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const db = getDb(c.env);
  const id = Number(c.req.param("id"));
  if ((await findPrize(db, id)) === null) {
    return c.json({ error: "Not found" }, 404);
  }
  // Built key by key so an omitted field stays omitted: spreading the parsed patch
  // would hand drizzle `label: undefined` and blank the column.
  const { label, enabled, sortOrder } = parsed.data;
  const updated = await db
    .update(prizes)
    .set({
      ...(label === undefined ? {} : { label }),
      ...(enabled === undefined ? {} : { enabled }),
      ...(sortOrder === undefined ? {} : { sortOrder }),
    })
    .where(eq(prizes.id, id))
    .returning();
  const row = updated[0];
  if (row === undefined) {
    return c.json({ error: "Update failed" }, 500);
  }
  await broadcast(c.env, { type: "prizes_changed" });
  return c.json(toPrize(row));
});

prizesRoutes.delete("/:id", async (c) => {
  const db = getDb(c.env);
  const id = Number(c.req.param("id"));
  if ((await findPrize(db, id)) === null) {
    return c.json({ error: "Not found" }, 404);
  }
  // Nothing hangs off a prize row: the wheel snapshots its segments and an award
  // copies its label, so a deleted prize cannot orphan a past result.
  await db.delete(prizes).where(eq(prizes.id, id));
  await broadcast(c.env, { type: "prizes_changed" });
  return c.json({ ok: true });
});
