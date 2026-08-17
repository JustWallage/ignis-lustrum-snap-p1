import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  photoDescriptions,
  photos,
  retiredPhotos,
  type PhotoRow,
} from "../../db/schema";
import {
  dayPhotosSchema,
  dayRankingSchema,
  retirementSchema,
} from "../../shared/api";
import { isEventRunning } from "../../shared/events";
import type { AppEnv, Bindings } from "../env";
import { broadcast, pushGameState } from "../lib/broadcast";
import { getDb, type Db } from "../lib/db";
import { readEventState } from "../lib/event";
import { isDayRevealed, readGameState } from "../lib/game-state";
import { photoAggregates, purgePhoto } from "../lib/photo-rows";
import { rankDay, readDayRanking } from "../lib/photo-score";
import { toPhoto } from "../lib/serialize";
import { EVENT_IS_LIVE } from "./admin-clock";

export const adminPhotoRoutes = new Hono<AppEnv>();

export const adminDayRoutes = new Hono<AppEnv>();

const daySchema = z.coerce.number().int().positive();

const idSchema = z.coerce.number().int().positive();

function retireStatements(db: Db, rows: readonly PhotoRow[], by: number) {
  const retiredAt = new Date();
  return rows.flatMap((row) => [
    db.insert(retiredPhotos).values({
      photoId: row.id,
      userId: row.userId,
      day: row.day,
      r2Key: row.r2Key,
      contentType: row.contentType,
      retiredAt,
      retiredBy: by,
    }),
    ...purgePhoto(db, row.id),
  ]);
}

async function retire(
  env: Bindings,
  db: Db,
  rows: readonly PhotoRow[],
  by: number,
): Promise<number> {
  const [first, ...rest] = retireStatements(db, rows, by);
  if (first === undefined) return 0;
  await db.batch([first, ...rest]);
  for (const row of rows) {
    await broadcast(env, { type: "photo_deleted", id: row.id });
  }
  await pushGameState(env, await readGameState(db));
  return rows.length;
}

adminPhotoRoutes.post("/:id/retire", async (c) => {
  const asked = idSchema.safeParse(c.req.param("id"));
  if (!asked.success) return c.json({ error: "Not found" }, 404);
  if (isEventRunning(await readEventState(c.env))) {
    return c.json({ error: EVENT_IS_LIVE }, 409);
  }
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(photos)
    .where(eq(photos.id, asked.data))
    .limit(1);
  const photo = rows[0];
  if (photo === undefined) return c.json({ error: "Not found" }, 404);
  return c.json(
    retirementSchema.parse({
      day: photo.day,
      retired: await retire(c.env, db, [photo], c.get("user").id),
    }),
  );
});

adminDayRoutes.post("/:day/retire", async (c) => {
  const asked = daySchema.safeParse(c.req.param("day"));
  if (!asked.success) return c.json({ error: "Not found" }, 404);
  if (isEventRunning(await readEventState(c.env))) {
    return c.json({ error: EVENT_IS_LIVE }, 409);
  }
  const db = getDb(c.env);
  const rows = await db.select().from(photos).where(eq(photos.day, asked.data));
  return c.json(
    retirementSchema.parse({
      day: asked.data,
      retired: await retire(c.env, db, rows, c.get("user").id),
    }),
  );
});

// Nothing else lists an unrevealed day: `/api/days/:day/results` 403s one,
// `/api/votes/candidates` is the current day and takes no parameter, and the photos
// router has no list route at all — and the unrevealed day is exactly the one the
// operator wants to empty.
adminDayRoutes.get("/:day/photos", async (c) => {
  const asked = daySchema.safeParse(c.req.param("day"));
  if (!asked.success) return c.json({ error: "Not found" }, 404);
  const db = getDb(c.env);
  const viewerId = c.get("user").id;
  const day = asked.data;
  const rows = await photoAggregates(db, viewerId, eq(photos.day, day));
  const revealed = isDayRevealed(day, await readGameState(db));
  const described = await db
    .select({
      photoId: photoDescriptions.photoId,
      status: photoDescriptions.status,
    })
    .from(photoDescriptions)
    .innerJoin(photos, eq(photos.id, photoDescriptions.photoId))
    .where(eq(photos.day, day));
  return c.json(
    dayPhotosSchema.parse({
      day,
      photos: rows.map((row) =>
        toPhoto(row, {
          uploader: row.uploaderId === viewerId || revealed,
          score: revealed,
        }),
      ),
      descriptions: described,
      ranking: await readDayRanking(db, day),
    }),
  );
});

// No `broadcast` on purpose: no verdict is served to any client before its day is
// revealed, so a re-ranking has nothing to invalidate. Awaited rather than handed to
// `waitUntil`, because the operator pressed a button and is owed the answer.
adminDayRoutes.post("/:day/rank", async (c) => {
  const asked = daySchema.safeParse(c.req.param("day"));
  if (!asked.success) return c.json({ error: "Not found" }, 404);
  const db = getDb(c.env);
  await rankDay(c.env, asked.data);
  return c.json(dayRankingSchema.parse(await readDayRanking(db, asked.data)));
});
