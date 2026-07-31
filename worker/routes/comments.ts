import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { comments, photos, users } from "../../db/schema";
import { commentCreateSchema, commentListSchema } from "../../shared/api";
import type { AppEnv } from "../env";
import { isAdmin } from "../lib/auth";
import { broadcast } from "../lib/broadcast";
import { getDb, type Db } from "../lib/db";
import { parseJsonBody } from "../lib/http";
import { toComment } from "../lib/serialize";

export const commentsRoutes = new Hono<AppEnv>();

async function photoExists(db: Db, photoId: number): Promise<boolean> {
  const rows = await db
    .select({ id: photos.id })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);
  return rows[0] !== undefined;
}

commentsRoutes.get("/", async (c) => {
  const db = getDb(c.env);
  const photoId = Number(c.req.param("id"));
  const rows = await db
    .select({
      id: comments.id,
      photoId: comments.photoId,
      authorId: users.id,
      authorName: users.name,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(eq(comments.photoId, photoId))
    .orderBy(asc(comments.id));
  return c.json(commentListSchema.parse({ comments: rows.map(toComment) }));
});

commentsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const parsed = commentCreateSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const db = getDb(c.env);
  const photoId = Number(c.req.param("id"));
  if (!(await photoExists(db, photoId))) {
    return c.json({ error: "Not found" }, 404);
  }
  const inserted = await db
    .insert(comments)
    .values({
      photoId,
      userId: user.id,
      body: parsed.data.body,
      createdAt: new Date(),
    })
    .returning();
  const row = inserted[0];
  if (row === undefined) {
    return c.json({ error: "Insert failed" }, 500);
  }
  await broadcast(c.env, { type: "comment_created", photoId });
  return c.json(
    toComment({
      id: row.id,
      photoId,
      authorId: user.id,
      authorName: user.name,
      body: row.body,
      createdAt: row.createdAt,
    }),
    201,
  );
});

commentsRoutes.delete("/:cid", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env);
  const photoId = Number(c.req.param("id"));
  const cid = Number(c.req.param("cid"));
  const rows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, cid), eq(comments.photoId, photoId)))
    .limit(1);
  const comment = rows[0];
  if (comment === undefined) {
    return c.json({ error: "Not found" }, 404);
  }
  if (comment.userId !== user.id && !isAdmin(user.name, c.env.ADMIN_NAMES)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await db.delete(comments).where(eq(comments.id, cid));
  await broadcast(c.env, { type: "comment_deleted", photoId });
  return c.json({ ok: true });
});
