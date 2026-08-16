import { and, asc, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { avatarGenerations, photoScores, photos, users } from "../../db/schema";
import {
  avatarCapsSchema,
  avatarCountsSchema,
  evaluationRetrySchema,
  failedEvaluationsSchema,
  juryBenchSchema,
  photoDescriptionSchema,
} from "../../shared/api";
import { JURIES, type Jury } from "../../shared/juries";
import type { AppEnv, Bindings } from "../env";
import { isAdmin } from "../lib/auth";
import { avatarTotals } from "../lib/avatar";
import { readAvatarCaps, writeAvatarCapsStatement } from "../lib/avatar-caps";
import { bytesToBase64 } from "../lib/bytes";
import { getDb, type Db } from "../lib/db";
import { readGameState } from "../lib/game-state";
import { readImage } from "../lib/images";
import { avatarSpend, requestEvaluation } from "../lib/gemini";
import { parseJsonBody } from "../lib/http";
import { readImageFile } from "../lib/image-upload";
import { describePhoto } from "../lib/photo-description";
import { scorePhoto } from "../lib/photo-score";
import { rateLimiter } from "../lib/rate-limit";
import { adminBowserRoutes } from "./admin-bowser";
import { adminClockRoutes } from "./admin-clock";
import { adminImagesRoutes } from "./admin-images";
import { adminDayRoutes, adminPhotoRoutes } from "./admin-retire";
import { adminRigRoutes } from "./admin-rig";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (!isAdmin(user.name, c.env.ADMIN_NAMES)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return next();
});

adminRoutes.route("/bowser", adminBowserRoutes);
adminRoutes.route("/rig", adminRigRoutes);
adminRoutes.route("/day", adminClockRoutes);
adminRoutes.route("/days", adminDayRoutes);
adminRoutes.route("/photos", adminPhotoRoutes);
adminRoutes.route("/images", adminImagesRoutes);

const askedDaySchema = z.coerce.number().int().positive();

async function askedDay(db: Db, query: string | undefined): Promise<number> {
  const parsed = askedDaySchema.safeParse(query);
  return parsed.success ? parsed.data : (await readGameState(db)).day;
}

const SCORED_COLUMNS = {
  id: photos.id,
  day: photos.day,
  r2Key: photos.r2Key,
  contentType: photos.contentType,
} as const;

async function pickPhoto(db: Db, id: string | undefined) {
  const rows = await db
    .select(SCORED_COLUMNS)
    .from(photos)
    .where(eq(photos.id, Number(id)))
    .limit(1);
  return rows[0];
}

/** The join is what makes "failed" a verdict saying Gemini choked rather than a snap
 * still in `waitUntil`. */
function isFailedOn(day: number) {
  return and(eq(photos.day, day), eq(photoScores.aiStatus, "failed"));
}

/** Sequential on purpose: fourteen multimodal calls at once earns a rate limit.
 * A row whose object has gone is SKIPPED rather than re-scored: the jury would
 * otherwise be handed an empty image and still write a verdict over it. */
async function retry(
  env: Bindings,
  rows: {
    id: number;
    day: number;
    r2Key: string | null;
    contentType: string;
  }[],
): Promise<{ attempted: number; ok: number; failed: number }> {
  let ok = 0;
  for (const row of rows) {
    const bytes = await readImage(env, row.r2Key);
    if (bytes === null) continue;
    const scored = await scorePhoto(env, {
      ...row,
      data: bytesToBase64(bytes),
    });
    if (scored === "ok") ok += 1;
  }
  return { attempted: rows.length, ok, failed: rows.length - ok };
}

adminRoutes.get("/evaluate", async (c) => {
  const db = getDb(c.env);
  const day = await askedDay(db, c.req.query("day"));
  const counted = await db
    .select({ value: count() })
    .from(photos)
    .innerJoin(photoScores, eq(photoScores.photoId, photos.id))
    .where(isFailedOn(day));
  return c.json(
    failedEvaluationsSchema.parse({ day, failed: counted[0]?.value ?? 0 }),
  );
});

// No `broadcast` on purpose: an unrevealed verdict is served to no client, so
// there is nothing for a retry to invalidate.
adminRoutes.post("/evaluate", async (c) => {
  const db = getDb(c.env);
  const day = await askedDay(db, c.req.query("day"));
  const rows = await db
    .select(SCORED_COLUMNS)
    .from(photos)
    .innerJoin(photoScores, eq(photoScores.photoId, photos.id))
    .where(isFailedOn(day));
  return c.json(
    evaluationRetrySchema.parse({ day, ...(await retry(c.env, rows)) }),
  );
});

adminRoutes.get("/avatars", async (c) => {
  const db = getDb(c.env);
  const day = await askedDay(db, c.req.query("day"));
  const [caps, totals, rows] = await Promise.all([
    readAvatarCaps(db),
    avatarTotals(db, day),
    db
      .select({ id: users.id, name: users.name, used: avatarGenerations.used })
      .from(users)
      .leftJoin(
        avatarGenerations,
        and(
          eq(avatarGenerations.userId, users.id),
          eq(avatarGenerations.day, day),
        ),
      )
      .orderBy(asc(users.name)),
  ]);
  return c.json(
    avatarCountsSchema.parse({
      day,
      ...caps,
      ...totals,
      estimate: avatarSpend(totals.allTime),
      players: rows.map((row) => ({
        user: { id: row.id, name: row.name },
        used: row.used ?? 0,
      })),
    }),
  );
});

// A cap is REPLACED wholesale rather than patched field by field: the editor shows both
// numbers prefilled from what is in force, so a save that carried one of them would be
// the screen disagreeing with itself.
adminRoutes.patch("/avatars", async (c) => {
  const asked = avatarCapsSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!asked.success) {
    return c.json(
      { error: "A cap is a whole number of pictures, 0 or more" },
      400,
    );
  }
  const db = getDb(c.env);
  await writeAvatarCapsStatement(db, asked.data);
  return c.json(avatarCapsSchema.parse(await readAvatarCaps(db)));
});

export const BENCH_RATE_LIMIT = 6;

const BENCH_RATE_WINDOW_MS = 60_000;

/** A bench press is a billed multimodal call with a button behind it, and a button can
 * be held down. Per user, like the neighbour's. */
export const benchRateLimit = rateLimiter(
  BENCH_RATE_LIMIT,
  BENCH_RATE_WINDOW_MS,
);

const juryIndexSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(JURIES.length - 1);

/** The emptiness check is load-bearing in front of the coercion: `z.coerce.number()`
 * reads "" as 0, so a missing or blank field would have quietly picked jury one. */
function askedJury(field: unknown): Jury | undefined {
  if (typeof field !== "string" || field.trim() === "") return undefined;
  const asked = juryIndexSchema.safeParse(field);
  return asked.success ? JURIES[asked.data] : undefined;
}

const PICK_A_JURY = "Pick one of the juries";

const BENCH_OFFLINE = "The jury bench is offline. Nothing was scored.";

const BENCH_FAILED = "The jury choked on that one. Have another go.";

/**
 * The one Gemini call in the app with no snap behind it: nothing is inserted into
 * `photos` or `photo_scores`, nothing is counted and nothing is broadcast, so a bench
 * press cannot touch a day. The persona comes from `JURIES` alone — the request picks
 * an index and supplies no text.
 */
adminRoutes.post("/bench", async (c) => {
  const form = await c.req.formData();
  const jury = askedJury(form.get("jury"));
  if (jury === undefined) {
    return c.json({ error: PICK_A_JURY }, 400);
  }
  const upload = readImageFile(form, "photo");
  if ("error" in upload) {
    return c.json({ error: upload.error }, 400);
  }
  const apiKey = c.env.GEMINI_API_KEY;
  // No key is how local and e2e always run, and the bench is the avatar machine's
  // kind of surface: a plain "offline" an admin can read, never a crash. ABOVE the
  // limiter, which exists to cap a bill: a press that reaches no model spends
  // nothing, and spending a slot on it is a 429 with no meaning behind it — the same
  // trade the avatar machine makes by refunding every path that stores no sprite.
  if (apiKey === undefined || apiKey === "") {
    return c.json({ error: BENCH_OFFLINE }, 503);
  }
  if (!benchRateLimit.allow(String(c.get("user").id))) {
    return c.json(
      { error: "The bench needs a moment. Try again shortly." },
      429,
    );
  }
  try {
    const evaluation = await requestEvaluation(apiKey, jury, {
      data: bytesToBase64(new Uint8Array(await upload.file.arrayBuffer())),
      contentType: upload.file.type,
    });
    return c.json(
      juryBenchSchema.parse({
        jury: jury.name,
        theme: jury.theme,
        ...evaluation,
      }),
    );
  } catch {
    return c.json({ error: BENCH_FAILED }, 502);
  }
});

/** Broadcasts nothing: a description is not news, and no player-facing surface renders
 * one. An upsert like the first pass, so pressing it twice replaces rather than adds. */
adminRoutes.post("/photos/:id/describe", async (c) => {
  const photo = await pickPhoto(getDb(c.env), c.req.param("id"));
  if (photo === undefined) {
    return c.json({ error: "Not found" }, 404);
  }
  const bytes = await readImage(c.env, photo.r2Key);
  // A snap whose object has gone is refused rather than described, the way the jury
  // retry SKIPS one: a description written over an empty image is worse than none.
  if (bytes === null) {
    return c.json({ error: "Not found" }, 404);
  }
  const status = await describePhoto(c.env, {
    id: photo.id,
    data: bytesToBase64(bytes),
    contentType: photo.contentType,
  });
  if (status === "gone") {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(photoDescriptionSchema.parse({ photoId: photo.id, status }));
});

adminRoutes.post("/photos/:id/evaluate", async (c) => {
  const photo = await pickPhoto(getDb(c.env), c.req.param("id"));
  if (photo === undefined) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(
    evaluationRetrySchema.parse({
      day: photo.day,
      ...(await retry(c.env, [photo])),
    }),
  );
});
