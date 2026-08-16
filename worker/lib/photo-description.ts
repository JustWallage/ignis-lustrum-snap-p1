import { eq } from "drizzle-orm";
import { photoDescriptions } from "../../db/schema";
import type { PhotoDescription } from "../../shared/api";
import type { Bindings } from "../env";
import { getDb, type Db } from "./db";
import { requestDescription, type GeminiImage } from "./gemini";

/** A failure is STORED, for the reason `photo_scores` stores 5 with
 * `ai_status = 'failed'`: a missing row reads as "not described yet" forever, and the
 * console can then never tell the two apart. */
const NOTHING_READ =
  "The description machine choked on this photograph and read nothing off it.";

type DescriptionStatus = PhotoDescription["status"];

export function deletePhotoDescription(db: Db, photoId: number) {
  return db
    .delete(photoDescriptions)
    .where(eq(photoDescriptions.photoId, photoId));
}

/** An UPSERT, which is what makes the console's button and the upload's first pass one
 * function. NEVER rejects: in `waitUntil` a rejection is a description silently lost. */
export async function describePhoto(
  env: Bindings,
  photo: GeminiImage & { id: number },
): Promise<DescriptionStatus | "gone"> {
  const apiKey = env.GEMINI_API_KEY;
  let described: string | null = null;
  if (apiKey !== undefined && apiKey !== "") {
    try {
      described = await requestDescription(apiKey, photo);
    } catch {
      described = null;
    }
  }
  const status: DescriptionStatus = described === null ? "failed" : "ok";
  const written = {
    description: described ?? NOTHING_READ,
    status,
    createdAt: new Date(),
  };
  try {
    await getDb(env)
      .insert(photoDescriptions)
      .values({ photoId: photo.id, ...written })
      .onConflictDoUpdate({
        target: photoDescriptions.photoId,
        set: written,
      });
  } catch {
    // Retired or replaced while Gemini was reading it. Its replacement gets its own.
    return "gone";
  }
  return status;
}
