import { eq, sql } from "drizzle-orm";
import {
  dayRankings,
  photoDescriptions,
  photoScores,
  photos,
} from "../../db/schema";
import type { DayRanking } from "../../shared/api";
import { juryForDay } from "../../shared/juries";
import type { Bindings } from "../env";
import { getDb, type Db } from "./db";
import {
  requestRanking,
  type DescribedSnap,
  type RankedVerdict,
} from "./gemini";

/**
 * The day-level fallback, which exists so a keyless environment still produces rows:
 * a MISSING verdict is indistinguishable from "not ranked yet" and would drop every
 * player out of the day's scoring. Distinctness cannot hold across it — every snap is
 * the same 5 — which is the unscored-field case `scoreDay` already answers by giving
 * the whole field the median position.
 */
const FALLBACK_SCORE = 5;

const FALLBACK_CRITIQUE =
  "The jury stared, the machinery coughed, and your photo broke it. Have a 5 and our apologies.";

export function deletePhotoScore(db: Db, photoId: number) {
  return db.delete(photoScores).where(eq(photoScores.photoId, photoId));
}

interface DaySnap {
  photoId: number;
  description: string | null;
  described: "ok" | "failed" | null;
}

async function snapsOfDay(db: Db, day: number): Promise<DaySnap[]> {
  return db
    .select({
      photoId: photos.id,
      description: photoDescriptions.description,
      described: photoDescriptions.status,
    })
    .from(photos)
    .leftJoin(photoDescriptions, eq(photoDescriptions.photoId, photos.id))
    .where(eq(photos.day, day));
}

function describedOnly(snaps: readonly DaySnap[]): DescribedSnap[] {
  return snaps.flatMap((snap) =>
    snap.described === "ok" && snap.description !== null
      ? [{ photoId: snap.photoId, description: snap.description }]
      : [],
  );
}

/**
 * ONE statement, so two re-ranks racing over the same day cannot read the same number
 * and both believe they are current — there is no `alone()` outside `RealtimeDO` and
 * comparing photo sets does not close the race (two runs over the same set are
 * reachable). The claim writes `failed`: a run that never comes back must read as a
 * failure rather than leaving the previous success standing.
 */
async function claimRun(db: Db, day: number): Promise<number> {
  const claimed = await db
    .insert(dayRankings)
    .values({ day, runStamp: 1, status: "failed", ranAt: null })
    .onConflictDoUpdate({
      target: dayRankings.day,
      set: {
        runStamp: sql`${dayRankings.runStamp} + 1`,
        status: "failed",
      },
    })
    .returning({ runStamp: dayRankings.runStamp });
  return claimed[0]?.runStamp ?? 1;
}

async function stillCurrent(
  db: Db,
  day: number,
  run: number,
): Promise<boolean> {
  const rows = await db
    .select({ runStamp: dayRankings.runStamp })
    .from(dayRankings)
    .where(eq(dayRankings.day, day))
    .limit(1);
  return rows[0]?.runStamp === run;
}

async function finish(
  db: Db,
  day: number,
  run: number,
  status: "ok" | "failed",
): Promise<void> {
  if (!(await stillCurrent(db, day, run))) return;
  await db
    .update(dayRankings)
    .set({ status, ranAt: new Date() })
    .where(eq(dayRankings.day, day));
}

/**
 * Per row, never one `db.batch`: `photo_scores.photo_id` is a real FK that D1 enforces,
 * so one snap retired while the jury was thinking would roll the whole day's verdicts
 * back. The dead row is skipped and the rest of the day stands.
 *
 * The stamp is re-read before EVERY row because a run overtaken half way through has to
 * stop THERE: an older order interleaving row by row with a newer one is how a day ends
 * up with two snaps on the same score, which is the one tie nothing can break.
 */
async function writeVerdicts(
  db: Db,
  day: number,
  run: number,
  verdicts: readonly RankedVerdict[],
  status: "ok" | "failed",
): Promise<boolean> {
  for (const verdict of verdicts) {
    if (!(await stillCurrent(db, day, run))) return false;
    const row = {
      aiScore: verdict.score,
      critique: verdict.critique,
      bonusDetected: verdict.bonusDetected,
      bonusReason: verdict.bonusReason,
      aiStatus: status,
      createdAt: new Date(),
    };
    try {
      await db
        .insert(photoScores)
        .values({ photoId: verdict.photoId, ...row })
        // `photo_scores_photo_idx` is what makes a re-rank replace the day's verdicts
        // rather than adding a second set.
        .onConflictDoUpdate({ target: photoScores.photoId, set: row });
    } catch {
      // Retired or replaced while Gemini was thinking. Its replacement gets its own.
    }
  }
  return true;
}

function fallbackFor(snaps: readonly DaySnap[]): RankedVerdict[] {
  return snaps.map((snap) => ({
    photoId: snap.photoId,
    score: FALLBACK_SCORE,
    critique: FALLBACK_CRITIQUE,
    bonusDetected: false,
    bonusReason: "",
  }));
}

/**
 * Re-ranks a WHOLE day in one text-only call and rewrites every one of its rows: ranking
 * a field of three and a field of four are different questions, so a partial day's order
 * is not a prefix of the full day's. NEVER rejects — in `waitUntil` a rejection is a
 * silently lost ranking — and a failure leaves the previous rows exactly as they were
 * rather than overwriting nine good verdicts because the tenth upload's call timed out.
 */
export async function rankDay(
  env: Bindings,
  day: number,
): Promise<"ok" | "failed" | "overtaken"> {
  try {
    return await rank(env, day);
  } catch {
    return "failed";
  }
}

async function rank(
  env: Bindings,
  day: number,
): Promise<"ok" | "failed" | "overtaken"> {
  const db = getDb(env);
  const snaps = await snapsOfDay(db, day);
  if (snaps.length === 0) return "ok";
  const apiKey = env.GEMINI_API_KEY;
  const run = await claimRun(db, day);

  if (apiKey === undefined || apiKey === "") {
    const written = await writeVerdicts(
      db,
      day,
      run,
      fallbackFor(snaps),
      "failed",
    );
    if (!written) return "overtaken";
    await finish(db, day, run, "failed");
    return "failed";
  }

  // A snap with no description of its own is left out rather than judged blind, and
  // scores whatever `scoreDay` pays an absent verdict.
  const described = describedOnly(snaps);
  if (described.length === 0) {
    await finish(db, day, run, "ok");
    return "ok";
  }

  let verdicts: RankedVerdict[];
  try {
    verdicts = await requestRanking(apiKey, juryForDay(day), described);
  } catch {
    await finish(db, day, run, "failed");
    return "failed";
  }
  if (!(await writeVerdicts(db, day, run, verdicts, "ok"))) return "overtaken";
  await finish(db, day, run, "ok");
  return "ok";
}

export async function readDayRanking(db: Db, day: number): Promise<DayRanking> {
  const [state, scored] = await Promise.all([
    db
      .select({ status: dayRankings.status, ranAt: dayRankings.ranAt })
      .from(dayRankings)
      .where(eq(dayRankings.day, day))
      .limit(1),
    db
      .select({ photoId: photoScores.photoId })
      .from(photoScores)
      .innerJoin(photos, eq(photos.id, photoScores.photoId))
      .where(eq(photos.day, day))
      .limit(1),
  ]);
  const row = state[0];
  return {
    // Read off the ROWS, not the run: "this day has verdicts" is a fact about
    // `photo_scores`, and a failed run that left the last good ones in place has not
    // ungenerated them.
    generated: scored.length > 0,
    ranAt: row?.ranAt?.toISOString() ?? null,
    failed: row?.status === "failed",
  };
}
