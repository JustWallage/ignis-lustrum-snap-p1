import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { avatarSprites, comments, photos, users } from "../../db/schema";
import {
  commentCreateSchema,
  commentListSchema,
  type CommentSubject,
} from "../../shared/api";
import type { AppEnv } from "../env";
import { isAdmin } from "../lib/auth";
import { broadcast } from "../lib/broadcast";
import { getDb, type Db } from "../lib/db";
import { parseJsonBody } from "../lib/http";
import { toComment } from "../lib/serialize";

async function subjectExists(
  db: Db,
  subject: CommentSubject,
  id: number,
): Promise<boolean> {
  const rows =
    subject === "photo"
      ? await db
          .select({ id: photos.id })
          .from(photos)
          .where(eq(photos.id, id))
          .limit(1)
      : await db
          .select({ id: avatarSprites.id })
          .from(avatarSprites)
          .where(eq(avatarSprites.id, id))
          .limit(1);
  return rows[0] !== undefined;
}

export function commentRoutes(subjectType: CommentSubject): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/", async (c) => {
    const db = getDb(c.env);
    const subjectId = Number(c.req.param("id"));
    const rows = await db
      .select({
        id: comments.id,
        subjectType: comments.subjectType,
        subjectId: comments.subjectId,
        authorId: users.id,
        authorName: users.name,
        body: comments.body,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .where(
        and(
          eq(comments.subjectType, subjectType),
          eq(comments.subjectId, subjectId),
        ),
      )
      .orderBy(asc(comments.id));
    return c.json(commentListSchema.parse({ comments: rows.map(toComment) }));
  });

  routes.post("/", async (c) => {
    const user = c.get("user");
    const parsed = commentCreateSchema.safeParse(
      await parseJsonBody(c.req.raw),
    );
    if (!parsed.success) {
      return c.json({ error: "Invalid request body" }, 400);
    }
    const db = getDb(c.env);
    const subjectId = Number(c.req.param("id"));
    if (!(await subjectExists(db, subjectType, subjectId))) {
      return c.json({ error: "Not found" }, 404);
    }
    const inserted = await db
      .insert(comments)
      .values({
        subjectType,
        subjectId,
        userId: user.id,
        body: parsed.data.body,
        createdAt: new Date(),
      })
      .returning();
    const row = inserted[0];
    if (row === undefined) {
      return c.json({ error: "Insert failed" }, 500);
    }
    await broadcast(c.env, { type: "comment_created", subjectType, subjectId });
    return c.json(
      toComment({
        id: row.id,
        subjectType,
        subjectId,
        authorId: user.id,
        authorName: user.name,
        body: row.body,
        createdAt: row.createdAt,
      }),
      201,
    );
  });

  routes.delete("/:cid", async (c) => {
    const user = c.get("user");
    const db = getDb(c.env);
    const subjectId = Number(c.req.param("id"));
    const cid = Number(c.req.param("cid"));
    const rows = await db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.id, cid),
          eq(comments.subjectType, subjectType),
          eq(comments.subjectId, subjectId),
        ),
      )
      .limit(1);
    const comment = rows[0];
    if (comment === undefined) {
      return c.json({ error: "Not found" }, 404);
    }
    if (comment.userId !== user.id && !isAdmin(user.name, c.env.ADMIN_NAMES)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await db.delete(comments).where(eq(comments.id, cid));
    await broadcast(c.env, { type: "comment_deleted", subjectType, subjectId });
    return c.json({ ok: true });
  });

  return routes;
}
