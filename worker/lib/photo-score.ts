import { eq } from "drizzle-orm";
import { photoScores } from "../../db/schema";
import { juryForDay } from "../../shared/juries";
import type { Bindings } from "../env";
import { getDb, type Db } from "./db";
import { requestEvaluation, type Evaluation } from "./gemini";

type Verdict = Omit<Evaluation, "caption"> & { caption: string | null };

/**
 * A failure writes a row like any other: a MISSING one is indistinguishable from "not
 * evaluated yet" and would drop the player out of the day's scoring. `caption` is the
 * one field it does not invent — the jury's line is theirs or nobody's.
 */
const FALLBACK: Verdict = {
  score: 5,
  critique:
    "The jury stared, the machinery coughed, and your photo broke it. Have a 5 and our apologies.",
  caption: null,
  bonusDetected: false,
  bonusReason: "",
};

interface ScoredPhoto {
  id: number;
  day: number;
  data: string;
  contentType: string;
}

export function deletePhotoScore(db: Db, photoId: number) {
  return db.delete(photoScores).where(eq(photoScores.photoId, photoId));
}

async function evaluate(
  env: Bindings,
  photo: ScoredPhoto,
): Promise<{ evaluation: Verdict; status: "ok" | "failed" }> {
  const apiKey = env.GEMINI_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    return { evaluation: FALLBACK, status: "failed" };
  }
  try {
    const evaluation = await requestEvaluation(
      apiKey,
      juryForDay(photo.day),
      photo,
    );
    return { evaluation, status: "ok" };
  } catch {
    return { evaluation: FALLBACK, status: "failed" };
  }
}

/** An UPSERT, which is what makes this both the upload's first pass and the admin's
 * retry. NEVER rejects: in `waitUntil` a rejection is a silently lost evaluation. */
export async function scorePhoto(
  env: Bindings,
  photo: ScoredPhoto,
): Promise<"ok" | "failed" | "gone"> {
  const { evaluation, status } = await evaluate(env, photo);
  const verdict = {
    aiScore: evaluation.score,
    critique: evaluation.critique,
    caption: evaluation.caption,
    bonusDetected: evaluation.bonusDetected,
    bonusReason: evaluation.bonusReason,
    aiStatus: status,
    createdAt: new Date(),
  };
  try {
    await getDb(env)
      .insert(photoScores)
      .values({ photoId: photo.id, ...verdict })
      // `photo_scores_photo_idx` is what makes this an upsert rather than a second
      // row: a retry replaces the failure it was pointed at.
      .onConflictDoUpdate({ target: photoScores.photoId, set: verdict });
  } catch {
    // Deleted or replaced while Gemini was thinking. Its replacement gets its own.
    return "gone";
  }
  return status;
}
