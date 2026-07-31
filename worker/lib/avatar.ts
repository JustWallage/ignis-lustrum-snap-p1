import { and, eq, sql } from "drizzle-orm";
import { avatarGenerations, users } from "../../db/schema";
import type { Bindings } from "../env";
import { readAvatarCaps } from "./avatar-caps";
import type { Db } from "./db";
import { requestAvatar, type GeminiImage } from "./gemini";
import { isWithinImageCap } from "./image-upload";

type Reservation = { ok: true; used: number } | { ok: false; townIsOut: true };

/**
 * BOTH caps decided in ONE statement, because nothing may read a count and then act on
 * it. The town's total is the SUM of the day's rows rather than a counter, so it cannot
 * drift; its guard sits in the SELECT feeding the insert, so a filled day produces no
 * row, no conflict, and `used + 1` never runs. No row back means the town is out. The
 * cap ARRIVES as a number — it is config, not the racing quantity, and the sum is still
 * evaluated inside the statement.
 */
async function reserve(
  db: Db,
  userId: number,
  day: number,
  townLimit: number,
): Promise<Reservation> {
  // `updated_at` is a drizzle `timestamp` column, which is unix SECONDS.
  const now = Math.floor(Date.now() / 1000);
  const rows = await db.all<{ used: number }>(sql`
    insert into avatar_generations (user_id, day, used, updated_at)
    select ${userId}, ${day}, 1, ${now}
    where (
      select coalesce(sum(used), 0) from avatar_generations where day = ${day}
    ) < ${townLimit}
    on conflict (user_id, day)
      do update set used = used + 1, updated_at = ${now}
    returning used
  `);
  const used = rows[0]?.used;
  return used === undefined
    ? { ok: false, townIsOut: true }
    : { ok: true, used };
}

/** Every path that does not end in a stored sprite refunds EXCEPT a reservation the
 * town's cap refused, which wrote nothing to give back. */
async function refund(db: Db, userId: number, day: number): Promise<void> {
  await db
    .update(avatarGenerations)
    .set({ used: sql`max(0, used - 1)`, updatedAt: new Date() })
    .where(
      and(eq(avatarGenerations.userId, userId), eq(avatarGenerations.day, day)),
    );
}

export async function quotaFor(
  db: Db,
  userId: number,
  day: number,
): Promise<{ remaining: number; limit: number }> {
  const [caps, rows] = await Promise.all([
    readAvatarCaps(db),
    db.all<{ mine: number; town: number }>(sql`
      select
        coalesce(sum(case when user_id = ${userId} then used end), 0) as mine,
        coalesce(sum(used), 0) as town
      from avatar_generations where day = ${day}
    `),
  ]);
  const row = rows[0];
  return {
    // The floor is what a LOWERED cap lands on: somebody who already spent more than
    // the new cap has a negative allowance, and a player is shown none, never a debt.
    remaining: Math.max(
      0,
      Math.min(
        caps.limit - (row?.mine ?? 0),
        caps.townLimit - (row?.town ?? 0),
      ),
    ),
    limit: caps.limit,
  };
}

/** Refunds decrement these rows, so both totals count generations that produced a sprite
 * rather than calls Google may have charged for. */
export async function avatarTotals(
  db: Db,
  day: number,
): Promise<{ dayTotal: number; allTime: number }> {
  const rows = await db.all<{ day_total: number; all_time: number }>(sql`
    select
      coalesce(sum(case when day = ${day} then used end), 0) as day_total,
      coalesce(sum(used), 0) as all_time
    from avatar_generations
  `);
  const row = rows[0];
  return { dayTotal: row?.day_total ?? 0, allTime: row?.all_time ?? 0 };
}

export type AvatarAttempt =
  | { ok: true; key: string }
  | { ok: false; status: 429 | 502 | 503; error: string };

export async function generateAvatar(
  env: Bindings,
  db: Db,
  user: { id: number },
  day: number,
  photo: GeminiImage,
): Promise<AvatarAttempt> {
  const caps = await readAvatarCaps(db);
  const slot = await reserve(db, user.id, day, caps.townLimit);
  // The town's cap wrote nothing, so there is nothing to hand back here.
  if (!slot.ok) {
    return {
      ok: false,
      status: 429,
      // A cap of 0 is an admin closing the machine, and the day-filled-up copy is a lie
      // there: nothing was drawn and nobody took the last of the ink.
      error:
        caps.townLimit === 0
          ? "The avatar machine is closed for today. Nothing was used up."
          : `The avatar machine has drawn all ${String(caps.townLimit)} avatars the town gets today. Somebody else got the last of the ink — try again tomorrow.`,
    };
  }
  if (slot.used > caps.limit) {
    await refund(db, user.id, day);
    return {
      ok: false,
      status: 429,
      error: `That is all ${String(caps.limit)} avatars for today. The machine needs to cool off — try again tomorrow.`,
    };
  }

  // The BILLED key, and never `GEMINI_API_KEY` as a fallback: falling back either way
  // round is the bug this split exists to prevent — the paid key spent on evaluations,
  // or the free one on pictures.
  const apiKey = env.GEMINI_API_KEY_PAID;
  // No key is how local and e2e always run: a plain "offline", never a crash.
  if (apiKey === undefined || apiKey === "") {
    await refund(db, user.id, day);
    return {
      ok: false,
      status: 503,
      error: "The avatar machine is offline. Nothing was used up.",
    };
  }

  let drawn: GeminiImage;
  try {
    drawn = await requestAvatar(apiKey, photo);
  } catch {
    await refund(db, user.id, day);
    return {
      ok: false,
      status: 502,
      error: "The avatar machine coughed and drew nothing. Have another go.",
    };
  }
  if (!isWithinImageCap(drawn.data)) {
    await refund(db, user.id, day);
    return {
      ok: false,
      status: 502,
      error: "The avatar came back too big to keep. Have another go.",
    };
  }

  return { ok: true, key: await storeAvatar(db, user.id, drawn) };
}

function spriteKey(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function storeAvatar(
  db: Db,
  userId: number,
  sprite: GeminiImage,
): Promise<string> {
  const key = spriteKey();
  await db
    .update(users)
    .set({
      avatar: sprite.data,
      avatarContentType: sprite.contentType,
      avatarUpdatedAt: new Date(),
      avatarKey: key,
    })
    .where(eq(users.id, userId));
  return key;
}

/** The handle alone, without dragging the base64 out of D1. */
export async function avatarKeyFor(
  db: Db,
  userId: number,
): Promise<string | null> {
  const rows = await db
    .select({ key: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.key ?? null;
}

export async function findAvatarByKey(
  db: Db,
  key: string,
): Promise<{ data: string; contentType: string } | null> {
  const rows = await db
    .select({ data: users.avatar, contentType: users.avatarContentType })
    .from(users)
    .where(eq(users.avatarKey, key))
    .limit(1);
  const row = rows[0];
  const data = row?.data ?? null;
  const contentType = row?.contentType ?? null;
  if (data === null || contentType === null) return null;
  return { data, contentType };
}

export async function findAvatar(
  db: Db,
  userId: number,
): Promise<{ data: string; contentType: string; updatedAt: Date } | null> {
  const rows = await db
    .select({
      data: users.avatar,
      contentType: users.avatarContentType,
      updatedAt: users.avatarUpdatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  const data = row?.data ?? null;
  const contentType = row?.contentType ?? null;
  const updatedAt = row?.updatedAt ?? null;
  if (data === null || contentType === null || updatedAt === null) return null;
  return { data, contentType, updatedAt };
}

export async function clearAvatar(db: Db, userId: number): Promise<void> {
  await db
    .update(users)
    .set({
      avatar: null,
      avatarContentType: null,
      avatarUpdatedAt: null,
      avatarKey: null,
    })
    .where(eq(users.id, userId));
}
