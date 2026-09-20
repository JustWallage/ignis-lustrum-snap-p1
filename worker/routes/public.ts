import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { photoScores, photos, users } from "../../db/schema";
import { publicGallerySchema } from "../../shared/api";
import { juryForDay } from "../../shared/juries";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../lib/db";
import { isDayRevealed, readGameState } from "../lib/game-state";
import { readImage } from "../lib/images";
import { toPublicPhoto, type PublicPhotoRow } from "../lib/serialize";

export const publicRoutes = new Hono<AppEnv>();

/**
 * How long a published picture may sit in a shared cache. NOT `immutable`, which every
 * other image route is: those URLs are behind the cookie and their bytes never change,
 * while this one can be WITHDRAWN. Five minutes is the honest promise — un-sharing
 * stops new readers within it, and nothing recalls a copy somebody already has. That is
 * what publishing means, and the archive's own toggle says so.
 */
const PUBLIC_CACHE_SECONDS = 300;

/** Shared by its photographer, not vetoed by the operator, and its day out. The three
 * are ANDed in one place so the listing and the bytes cannot disagree about what is
 * published — a picture visible on the page whose URL 404s, or worse the other way
 * round, is the failure this function exists to prevent. */
function publishedRows(db: Db) {
  return db
    .select({
      id: photos.id,
      day: photos.day,
      photographer: users.name,
      aiScore: photoScores.aiScore,
      aiStatus: photoScores.aiStatus,
    })
    .from(photos)
    .innerJoin(users, eq(users.id, photos.userId))
    .leftJoin(photoScores, eq(photoScores.photoId, photos.id))
    .where(and(eq(photos.sharedPublicly, true), eq(photos.publicVeto, false)));
}

publicRoutes.get("/gallery", async (c) => {
  const db = getDb(c.env);
  const state = await readGameState(db);
  const rows = await publishedRows(db).orderBy(
    desc(photos.day),
    desc(photos.id),
  );
  const out: PublicPhotoRow[] = rows.flatMap((row) =>
    isDayRevealed(row.day, state)
      ? [{ ...row, theme: juryForDay(row.day).theme }]
      : [],
  );
  return c.json(publicGallerySchema.parse({ photos: out.map(toPublicPhoto) }));
});

/**
 * The one image route in front of the cookie. It re-asks the WHOLE question rather than
 * trusting that a caller who has the URL was given it by the listing: a link shared
 * onwards outlives the answer that produced it, and un-sharing a photograph has to take
 * its bytes with it.
 */
publicRoutes.get("/photos/:id/image", async (c) => {
  const db = getDb(c.env);
  const rows = await db
    .select({
      day: photos.day,
      r2Key: photos.r2Key,
      contentType: photos.contentType,
    })
    .from(photos)
    .where(
      and(
        eq(photos.id, Number(c.req.param("id"))),
        eq(photos.sharedPublicly, true),
        eq(photos.publicVeto, false),
      ),
    )
    .limit(1);
  const photo = rows[0];
  if (photo === undefined) return c.json({ error: "Not found" }, 404);
  if (!isDayRevealed(photo.day, await readGameState(db))) {
    return c.json({ error: "Not found" }, 404);
  }
  const bytes = await readImage(c.env, photo.r2Key);
  if (bytes === null) return c.json({ error: "Not found" }, 404);
  return new Response(bytes, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": `public, max-age=${String(PUBLIC_CACHE_SECONDS)}`,
    },
  });
});
