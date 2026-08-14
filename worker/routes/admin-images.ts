import { eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { avatarSprites, photos, retiredPhotos, users } from "../../db/schema";
import { bucketSchema, type BucketObject } from "../../shared/api";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../lib/db";
import {
  imagePrefix,
  listImages,
  readImage,
  spriteObjectKey,
  type StoredObject,
} from "../lib/images";

export const adminImagesRoutes = new Hono<AppEnv>();

interface RetiredRow {
  photoId: number;
  day: number;
  uploaderId: number;
  uploaderName: string;
  key: string;
}

function imageUrl(key: string): string {
  return `/api/admin/images/${key}`;
}

async function liveKeys(db: Db, env: AppEnv["Bindings"]): Promise<Set<string>> {
  const [snaps, sprites] = await Promise.all([
    db
      .select({ key: photos.r2Key })
      .from(photos)
      .where(isNotNull(photos.r2Key)),
    // The HISTORY, not `users.avatar_key`: nothing deletes a sprite, so a face nobody
    // wears any more is still live bytes an old gallery loads.
    db.select({ key: avatarSprites.key }).from(avatarSprites),
  ]);
  const keys = new Set<string>();
  for (const row of snaps) {
    if (row.key !== null) keys.add(row.key);
  }
  for (const row of sprites) {
    keys.add(spriteObjectKey(env, row.key));
  }
  return keys;
}

async function retiredByKey(db: Db): Promise<Map<string, RetiredRow>> {
  const rows = await db
    .select({
      photoId: retiredPhotos.photoId,
      day: retiredPhotos.day,
      uploaderId: users.id,
      uploaderName: users.name,
      key: retiredPhotos.r2Key,
    })
    .from(retiredPhotos)
    .innerJoin(users, eq(users.id, retiredPhotos.userId))
    .where(isNotNull(retiredPhotos.r2Key));
  const byKey = new Map<string, RetiredRow>();
  for (const row of rows) {
    if (row.key !== null) byKey.set(row.key, { ...row, key: row.key });
  }
  return byKey;
}

function total(objects: readonly StoredObject[]): number {
  return objects.reduce((sum, object) => sum + object.size, 0);
}

adminImagesRoutes.get("/", async (c) => {
  const db = getDb(c.env);
  const [objects, live, retired] = await Promise.all([
    listImages(c.env),
    liveKeys(db, c.env),
    retiredByKey(db),
  ]);
  const liveObjects: StoredObject[] = [];
  const retiredObjects: (StoredObject & RetiredRow & { url: string })[] = [];
  const orphaned: BucketObject[] = [];
  for (const object of objects) {
    const row = retired.get(object.key);
    if (row !== undefined) {
      retiredObjects.push({ ...object, ...row, url: imageUrl(object.key) });
    } else if (live.has(object.key)) {
      liveObjects.push(object);
    } else {
      orphaned.push(object);
    }
  }
  return c.json(
    bucketSchema.parse({
      live: { count: liveObjects.length, bytes: total(liveObjects) },
      retired: {
        count: retiredObjects.length,
        bytes: total(retiredObjects),
        objects: retiredObjects.map((object) => ({
          key: object.key,
          size: object.size,
          photoId: object.photoId,
          day: object.day,
          uploader: { id: object.uploaderId, name: object.uploaderName },
          url: object.url,
        })),
      },
      orphaned: {
        count: orphaned.length,
        bytes: total(orphaned),
        objects: orphaned,
      },
    }),
  );
});

/**
 * An orphan is refused rather than guessed at: `putImage` writes no `httpMetadata`, so
 * nothing but `retired_photos` knows a content type. `:key{.+}` rather than a bare `/*`,
 * which matches the slashes in a key but is not readable back as a parameter.
 */
adminImagesRoutes.get("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  if (!key.startsWith(imagePrefix(c.env))) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const rows = await getDb(c.env)
    .select({ contentType: retiredPhotos.contentType })
    .from(retiredPhotos)
    .where(eq(retiredPhotos.r2Key, key))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return c.json({ error: "Not found" }, 404);
  const bytes = await readImage(c.env, key);
  if (bytes === null) return c.json({ error: "Not found" }, 404);
  return new Response(bytes, {
    headers: {
      "Content-Type": row.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"retired-${key}"`,
    },
  });
});
