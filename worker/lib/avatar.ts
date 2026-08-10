import { and, asc, desc, eq, sql } from "drizzle-orm";
import { avatarGenerations, avatarSprites, users } from "../../db/schema";
import type { Bindings } from "../env";
import { readAvatarCaps } from "./avatar-caps";
import type { Db } from "./db";
import { requestAvatar, type DrawnAvatar, type GeminiImage } from "./gemini";
import { putImage, randomHandle, spriteObjectKey } from "./images";
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

  let drawn: DrawnAvatar;
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
  if (!isWithinImageCap(drawn.bytes)) {
    await refund(db, user.id, day);
    return {
      ok: false,
      status: 502,
      error: "The avatar came back too big to keep. Have another go.",
    };
  }

  return { ok: true, key: await storeAvatar(env, db, user.id, drawn) };
}

/** Nothing here deletes the sprite it supersedes, in the bucket or in D1. A history of
 * rows whose objects had been swept is a gallery of broken images, and re-wearing one
 * would 404 — which is why the object outliving its turn is the whole point. */
export async function storeAvatar(
  env: Bindings,
  db: Db,
  userId: number,
  sprite: DrawnAvatar,
): Promise<string> {
  const key = randomHandle();
  const drawnAt = new Date();
  // Object BEFORE row, as everywhere else: what an interrupted write leaks is an orphan
  // nobody references, never a history row whose image 404s.
  await putImage(env, spriteObjectKey(env, key), sprite.bytes);
  await db.insert(avatarSprites).values({
    userId,
    key,
    contentType: sprite.contentType,
    createdAt: drawnAt,
  });
  await wear(db, userId, key, drawnAt);
  return key;
}

/** The one write that says what somebody is wearing — both columns in a single
 * statement, so nothing can leave a key without the timestamp its `?v=` is cut from. */
async function wear(
  db: Db,
  userId: number,
  key: string,
  at: Date,
): Promise<void> {
  await db
    .update(users)
    .set({ avatarUpdatedAt: at, avatarKey: key })
    .where(eq(users.id, userId));
}

/** Putting an old one back on: no model call, no quota slot taken and none refunded,
 * because `avatar_generations` counts DRAWINGS and this draws nothing. A sprite that is
 * not yours is indistinguishable from one that does not exist — the listing pairs a name
 * with a key, and a 403 here would turn that into an oracle. */
export async function wearSprite(
  db: Db,
  userId: number,
  spriteId: number,
): Promise<string | null> {
  const rows = await db
    .select({ key: avatarSprites.key })
    .from(avatarSprites)
    .where(
      and(eq(avatarSprites.id, spriteId), eq(avatarSprites.userId, userId)),
    )
    .limit(1);
  const key = rows[0]?.key;
  if (key === undefined) return null;
  await wear(db, userId, key, new Date());
  return key;
}

export interface TownSprite {
  userId: number;
  userName: string;
  id: number;
  key: string;
  worn: boolean;
  createdAt: Date;
}

export async function townSprites(db: Db): Promise<TownSprite[]> {
  return db
    .select({
      userId: users.id,
      userName: users.name,
      id: avatarSprites.id,
      key: avatarSprites.key,
      worn: sql<number>`(${users.avatarKey} is not null and ${users.avatarKey} = ${avatarSprites.key})`,
      createdAt: avatarSprites.createdAt,
    })
    .from(avatarSprites)
    .innerJoin(users, eq(users.id, avatarSprites.userId))
    .orderBy(asc(users.name), desc(avatarSprites.id))
    .then((rows) => rows.map((row) => ({ ...row, worn: row.worn !== 0 })));
}

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

/** Answers the HISTORY, not the worn column: the moment a sprite stops being current its
 * URL would otherwise 404 and the gallery would be a wall of broken images. It still
 * says nothing about whose sprite it is. */
export async function findAvatarByKey(
  db: Db,
  key: string,
): Promise<{ contentType: string } | null> {
  const rows = await db
    .select({ contentType: avatarSprites.contentType })
    .from(avatarSprites)
    .where(eq(avatarSprites.key, key))
    .limit(1);
  const contentType = rows[0]?.contentType;
  if (contentType === undefined) return null;
  return { contentType };
}

export async function findAvatar(
  db: Db,
  userId: number,
): Promise<{ key: string; contentType: string; updatedAt: Date } | null> {
  const rows = await db
    .select({
      key: users.avatarKey,
      contentType: avatarSprites.contentType,
      updatedAt: users.avatarUpdatedAt,
    })
    .from(users)
    .innerJoin(avatarSprites, eq(avatarSprites.key, users.avatarKey))
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  const key = row?.key ?? null;
  const updatedAt = row?.updatedAt ?? null;
  if (row === undefined || key === null || updatedAt === null) return null;
  return { key, contentType: row.contentType, updatedAt };
}

/** Takes what you are WEARING off and nothing else: the row and its object stay, so the
 * gallery keeps every face and any of them can be put back on. */
export async function clearAvatar(db: Db, userId: number): Promise<void> {
  await db
    .update(users)
    .set({ avatarUpdatedAt: null, avatarKey: null })
    .where(eq(users.id, userId));
}
