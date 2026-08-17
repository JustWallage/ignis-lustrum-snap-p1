import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  likes,
  photos,
  type NewPhotoRow,
  type PhotoRow,
} from "../../db/schema";
import { mySubmissionSchema } from "../../shared/api";
import type { AppEnv, Bindings } from "../env";
import { isAdmin } from "../lib/auth";
import { broadcast, pushGameState } from "../lib/broadcast";
import { bytesToBase64 } from "../lib/bytes";
import { getDb, type Db } from "../lib/db";
import { isDayRevealed, readGameState } from "../lib/game-state";
import { deleteImage, newSnapKey, putImage, readImage } from "../lib/images";
import { readImageFile } from "../lib/image-upload";
import { describePhoto } from "../lib/photo-description";
import { photoAggregates, purgePhoto } from "../lib/photo-rows";
import { rankDay } from "../lib/photo-score";
import { toPhoto } from "../lib/serialize";

export const photosRoutes = new Hono<AppEnv>();

const daySchema = z.coerce.number().int().positive();

function photoAggregate(db: Db, viewerId: number, id: number) {
  return photoAggregates(db, viewerId, eq(photos.id, id));
}

async function findPhoto(db: Db, id: number): Promise<PhotoRow | null> {
  const rows = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
  return rows[0] ?? null;
}

async function findSubmission(
  db: Db,
  userId: number,
  day: number,
): Promise<PhotoRow | null> {
  const rows = await db
    .select()
    .from(photos)
    .where(and(eq(photos.userId, userId), eq(photos.day, day)))
    .orderBy(desc(photos.id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * `photos_user_day_idx` is the table's only unique index, so a UNIQUE violation means
 * exactly one thing. Reading first and inserting second leaves a window two POSTs both
 * pass, which is why the CONSTRAINT decides.
 */
function isDuplicateSubmission(error: unknown): boolean {
  // Drizzle wraps the D1 failure and hangs the real one off `cause`, so the chain
  // is what has to be searched.
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (/UNIQUE constraint failed/i.test(cause.message)) return true;
  }
  return false;
}

async function writeSubmission(
  db: Db,
  values: NewPhotoRow,
  replacing: PhotoRow | null,
): Promise<PhotoRow | undefined> {
  if (replacing === null) {
    const inserted = await db.insert(photos).values(values).returning();
    return inserted[0];
  }
  // One hole per statement `purgePhoto` returns, then the insert's rows.
  const [, , , , , , inserted] = await db.batch([
    ...purgePhoto(db, replacing.id),
    db.insert(photos).values(values).returning(),
  ]);
  return inserted[0];
}

async function likeState(
  db: Db,
  photoId: number,
  viewerId: number,
): Promise<{ likeCount: number; likedByMe: boolean }> {
  const rows = await db
    .select({
      likeCount: sql<number>`count(*)`,
      likedByMe: sql<number>`coalesce(max(case when ${likes.userId} = ${viewerId} then 1 else 0 end), 0)`,
    })
    .from(likes)
    .where(eq(likes.photoId, photoId));
  const row = rows[0];
  return {
    likeCount: row?.likeCount ?? 0,
    likedByMe: (row?.likedByMe ?? 0) > 0,
  };
}

/** The snap gone mid-description is the one case that ranks nothing: its row is going
 * with it, and whatever replaces it brings its own upload. */
async function describeThenRank(
  env: Bindings,
  image: { id: number; data: string; contentType: string },
  day: number,
): Promise<void> {
  if ((await describePhoto(env, image)) === "gone") return;
  await rankDay(env, day);
}

photosRoutes.post("/", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData();
  const upload = readImageFile(form, "photo");
  if ("error" in upload) {
    return c.json({ error: upload.error }, 400);
  }
  const file = upload.file;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const db = getDb(c.env);
  const { day, phase } = await readGameState(db);
  if (phase !== "submission") {
    return c.json(
      { error: "Submissions are closed — the live event has started" },
      409,
    );
  }
  const replacing =
    form.get("replace") === null
      ? null
      : await findSubmission(db, user.id, day);

  const r2Key = newSnapKey(c.env);
  await putImage(c.env, r2Key, bytes);

  let row: PhotoRow | undefined;
  try {
    row = await writeSubmission(
      db,
      {
        userId: user.id,
        r2Key,
        contentType: file.type,
        day,
        createdAt: new Date(),
      },
      replacing,
    );
  } catch (cause: unknown) {
    if (!isDuplicateSubmission(cause)) throw cause;
    return c.json(
      { error: "You have already submitted today — the jury can swap it" },
      409,
    );
  }
  if (row === undefined) {
    return c.json({ error: "Insert failed" }, 500);
  }
  if (replacing !== null) {
    await deleteImage(c.env, replacing.r2Key);
    await broadcast(c.env, { type: "photo_deleted", id: replacing.id });
  }
  await broadcast(c.env, { type: "photo_created", id: row.id });
  await pushGameState(c.env, await readGameState(db));
  // NEVER on the upload's critical path: a slow model must not be something the
  // uploader waits for, and a broken one must not be something they see. The ranking
  // is CHAINED behind the description rather than beside it — it reads the day's
  // descriptions, so starting it first would rank a day this snap is not yet in.
  const image = {
    id: row.id,
    data: bytesToBase64(bytes),
    contentType: file.type,
  };
  c.executionCtx.waitUntil(describeThenRank(c.env, image, day));
  return c.json(
    toPhoto(
      {
        id: row.id,
        uploaderId: user.id,
        uploaderName: user.name,
        createdAt: row.createdAt,
        likeCount: 0,
        commentCount: 0,
        likedByMe: 0,
        aiScore: null,
      },
      { uploader: true, score: false },
    ),
    201,
  );
});

// Before "/:id", which would otherwise swallow "mine" and 404 on Number("mine").
photosRoutes.get("/mine", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env);
  const state = await readGameState(db);
  const asked = daySchema.safeParse(c.req.query("day"));
  const day = asked.success ? asked.data : state.day;
  const submission = await findSubmission(db, user.id, day);
  const rows =
    submission === null ? [] : await photoAggregate(db, user.id, submission.id);
  const row = rows[0];
  return c.json(
    mySubmissionSchema.parse({
      day,
      photo:
        row === undefined
          ? null
          : toPhoto(row, {
              uploader: true,
              score: isDayRevealed(day, state),
            }),
    }),
  );
});

photosRoutes.get("/:id/image", async (c) => {
  const db = getDb(c.env);
  const photo = await findPhoto(db, Number(c.req.param("id")));
  if (photo === null) {
    return c.json({ error: "Not found" }, 404);
  }
  const bytes = await readImage(c.env, photo.r2Key);
  if (bytes === null) {
    return c.json({ error: "Not found" }, 404);
  }
  return new Response(bytes, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"snap-${photo.id}"`,
    },
  });
});

photosRoutes.get("/:id", async (c) => {
  const db = getDb(c.env);
  const viewerId = c.get("user").id;
  const rows = await photoAggregate(db, viewerId, Number(c.req.param("id")));
  const row = rows[0];
  if (row === undefined) {
    return c.json({ error: "Not found" }, 404);
  }
  const revealed = isDayRevealed(row.day, await readGameState(db));
  return c.json(
    toPhoto(row, {
      uploader: row.uploaderId === viewerId || revealed,
      score: revealed,
    }),
  );
});

photosRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env);
  const id = Number(c.req.param("id"));
  const photo = await findPhoto(db, id);
  if (photo === null) {
    return c.json({ error: "Not found" }, 404);
  }
  if (photo.userId !== user.id && !isAdmin(user.name, c.env.ADMIN_NAMES)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await db.batch(purgePhoto(db, id));
  await deleteImage(c.env, photo.r2Key);
  await broadcast(c.env, { type: "photo_deleted", id });
  await pushGameState(c.env, await readGameState(db));
  return c.json({ ok: true });
});

photosRoutes.post("/:id/like", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env);
  const id = Number(c.req.param("id"));
  if ((await findPhoto(db, id)) === null) {
    return c.json({ error: "Not found" }, 404);
  }
  await db
    .insert(likes)
    .values({ photoId: id, userId: user.id, createdAt: new Date() })
    .onConflictDoNothing();
  const state = await likeState(db, id, user.id);
  await broadcast(c.env, { type: "photo_liked", id });
  return c.json({ id, ...state });
});

photosRoutes.delete("/:id/like", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env);
  const id = Number(c.req.param("id"));
  await db
    .delete(likes)
    .where(and(eq(likes.photoId, id), eq(likes.userId, user.id)));
  const state = await likeState(db, id, user.id);
  await broadcast(c.env, { type: "photo_liked", id });
  return c.json({ id, ...state });
});
