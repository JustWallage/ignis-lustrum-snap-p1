import { inArray, sql } from "drizzle-orm";
import { settings } from "../../db/schema";
import type { AvatarCaps } from "../../shared/api";
import type { Db } from "./db";

/**
 * The SEED defaults, duplicated in `0012`'s INSERT because a migration cannot import
 * TypeScript. They are also the fallback below, so a database that lost its `settings`
 * rows still answers `GET /api/avatar` instead of 500ing every player, and they are what
 * `worker/routes/test-quota.ts` bounds its request by at module scope, where no stored
 * value can be read.
 */
export const AVATAR_DAILY_LIMIT = 10;

export const AVATAR_GLOBAL_DAILY_LIMIT = 50;

export const DEFAULT_AVATAR_CAPS: AvatarCaps = {
  limit: AVATAR_DAILY_LIMIT,
  townLimit: AVATAR_GLOBAL_DAILY_LIMIT,
};

const DAILY_KEY = "avatar_daily_limit";

const TOWN_KEY = "avatar_town_daily_limit";

export async function readAvatarCaps(db: Db): Promise<AvatarCaps> {
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, [DAILY_KEY, TOWN_KEY]));
  const stored = (key: string) => rows.find((row) => row.key === key)?.value;
  return {
    limit: stored(DAILY_KEY) ?? AVATAR_DAILY_LIMIT,
    townLimit: stored(TOWN_KEY) ?? AVATAR_GLOBAL_DAILY_LIMIT,
  };
}

/** UNEXECUTED, so `POST /api/test/reset` can wind both caps back inside the ONE batch
 * it does everything else in. */
export function writeAvatarCapsStatement(db: Db, caps: AvatarCaps) {
  const now = new Date();
  return db
    .insert(settings)
    .values([
      { key: DAILY_KEY, value: caps.limit, updatedAt: now },
      { key: TOWN_KEY, value: caps.townLimit, updatedAt: now },
    ])
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sql`excluded.value`, updatedAt: now },
    });
}
