import { eq } from "drizzle-orm";
import { photoDescriptions } from "../../db/schema";
import type { JuryRun, PhotoDescription } from "../../shared/api";
import type { Bindings } from "../env";
import { getDb, type Db } from "./db";
import {
  juryKeys,
  requestDescription,
  shortReason,
  type GeminiImage,
} from "./gemini";

/** A failure is STORED, for the reason `photo_scores` stores 5 with
 * `ai_status = 'failed'`: a missing row reads as "not described yet" forever, and the
 * console can then never tell the two apart. */
const NOTHING_READ =
  "The description machine choked on this photograph and read nothing off it.";

type DescriptionStatus = PhotoDescription["status"];

export type DescribedPhoto = Pick<PhotoDescription, "status" | "failure">;

/** A configuration fault reads as a Gemini fault unless it says so itself: without the
 * key nothing is ever called, so there is no error for the console to print. */
export const NO_KEY = "No Gemini key is set, so nothing was asked.";

/**
 * The row a pass CLAIMS before it asks Gemini anything, so a pass that never returns
 * leaves something behind. The upload's describe runs in `waitUntil`, which the runtime
 * may tear down under it — and with nothing written first, the console showed those
 * snaps as "Not described", indistinguishable from a pass that never ran at all. Now
 * the difference is on the row. Same reasoning as `day_rankings`' own claim.
 */
export const NEVER_CAME_BACK = "The describer was asked and never came back.";

export function deletePhotoDescription(db: Db, photoId: number) {
  return db
    .delete(photoDescriptions)
    .where(eq(photoDescriptions.photoId, photoId));
}

/**
 * `onConflictDoNothing` and never an upsert: a re-describe must NOT trade a good
 * description for a placeholder on its way to asking again. A snap that has never been
 * read gets the claim; one that has keeps whatever it already says until the answer
 * comes back. `photo_descriptions.photo_id` is a real foreign key, so a photograph that
 * has gone makes this throw — which is the one thing that tells the two apart.
 */
async function claimDescription(db: Db, photoId: number): Promise<boolean> {
  try {
    await db
      .insert(photoDescriptions)
      .values({
        photoId,
        description: NOTHING_READ,
        status: "failed",
        failure: NEVER_CAME_BACK,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    return true;
  } catch {
    return false;
  }
}

/** An UPSERT, which is what makes the console's button and the upload's first pass one
 * function. NEVER rejects: in `waitUntil` a rejection is a description silently lost. */
export async function describePhoto(
  env: Bindings,
  photo: GeminiImage & { id: number },
  run: JuryRun = {},
): Promise<DescribedPhoto | "gone"> {
  const db = getDb(env);
  // BEFORE the call, or a pass the runtime tears down mid-flight writes nothing and the
  // console cannot tell it from a pass that never started.
  if (!(await claimDescription(db, photo.id))) return "gone";
  // `describing` and not the app-wide default: a photograph is the one call that comes
  // fourteen to a day, and the free tier's per-minute cap is what left them unread. The
  // wire's `default` lands here too, because it MEANS the app's own rule for the run —
  // sending it and omitting it have to be the same press, or the console has two ways
  // to say "nothing special" that spend different keys.
  const keys = juryKeys(env, run.spend === "billed" ? "billed" : "describing");
  let described: string | null = null;
  let failure: string | null = NO_KEY;
  if (keys.length > 0) {
    try {
      described = await requestDescription(keys, photo, run.model);
      failure = null;
    } catch (error) {
      failure = shortReason(error);
    }
  }
  const status: DescriptionStatus = described === null ? "failed" : "ok";
  // A FAILURE writes the status and the reason and LEAVES THE TEXT: the description is
  // the only record of the photograph the jury ever sees, so a retry that broke must
  // not cost the reading that worked — the same rule `rankDay` follows when it leaves a
  // day's previous verdicts standing. The claim above already put the placeholder under
  // a row that never had one, so there is nothing to lose on a first pass.
  const written = {
    ...(described === null ? {} : { description: described }),
    status,
    failure,
    createdAt: new Date(),
  };
  try {
    await db
      .insert(photoDescriptions)
      .values({
        photoId: photo.id,
        description: described ?? NOTHING_READ,
        status,
        failure,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: photoDescriptions.photoId,
        set: written,
      });
  } catch {
    // Retired or replaced while Gemini was reading it. Its replacement gets its own.
    return "gone";
  }
  return { status, failure };
}
