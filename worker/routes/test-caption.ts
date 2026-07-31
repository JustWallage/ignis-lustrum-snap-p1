import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { photoScores, photos } from "../../db/schema";
import type { AppEnv } from "../env";
import { getDb } from "../lib/db";
import { parseJsonBody } from "../lib/http";

// Puts the jury's caption on a verdict row without going through Gemini, because with
// no GEMINI_API_KEY every evaluation fails and a failure deliberately writes NO
// caption — which leaves the podium actually showing one unreachable in e2e.
export const testCaptionRoute = new Hono<AppEnv>();

const captionSchema = z.object({
  photoId: z.int().positive(),
  caption: z.string().trim().min(1).max(200),
});

testCaptionRoute.post("/", async (c) => {
  const parsed = captionSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: "Not a caption" }, 400);
  const { photoId, caption } = parsed.data;

  const db = getDb(c.env);
  const snap = await db
    .select({ day: photos.day })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);
  if (snap[0] === undefined) return c.json({ error: "Not found" }, 404);

  // An upsert on the same index `scorePhoto` writes through, so it works whether or
  // not the upload's own evaluation has landed — and touches nothing else when it
  // has.
  await db
    .insert(photoScores)
    .values({
      photoId,
      aiScore: 5,
      critique: "",
      caption,
      bonusDetected: false,
      bonusReason: "",
      aiStatus: "failed",
      createdAt: new Date(),
    })
    .onConflictDoUpdate({ target: photoScores.photoId, set: { caption } });

  return c.json({ ok: true });
});
