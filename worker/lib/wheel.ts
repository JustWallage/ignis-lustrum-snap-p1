import { and, asc, eq } from "drizzle-orm";
import { bowserDays, prizes, riggedDays } from "../../db/schema";
import type { PrizeSet } from "../../shared/api";
import type { Db } from "./db";

/** `sort_order` is admin-assigned and not unique, so `id` breaks the tie — the same
 * ordering the manager shows, so an operator can predict the wheel. */
export async function enabledPrizeLabels(
  db: Db,
  set: PrizeSet,
): Promise<string[]> {
  const rows = await db
    .select({ label: prizes.label })
    .from(prizes)
    .where(and(eq(prizes.enabled, true), eq(prizes.prizeSet, set)))
    .orderBy(asc(prizes.sortOrder), asc(prizes.id));
  return rows.map((row) => row.label);
}

/** Filtered by neither `enabled` nor `prize_set` on purpose: the caller matches this
 * against tonight's segments, which already encode both, and a filter here would be the
 * landing rule written a second time and free to disagree with itself. */
export async function riggedLabel(db: Db, day: number): Promise<string | null> {
  const rows = await db
    .select({ label: prizes.label })
    .from(riggedDays)
    .innerJoin(prizes, eq(prizes.id, riggedDays.prizeId))
    .where(eq(riggedDays.day, day))
    .limit(1);
  return rows[0]?.label ?? null;
}

export async function prizeSetForDay(db: Db, day: number): Promise<PrizeSet> {
  const rows = await db
    .select({ day: bowserDays.day })
    .from(bowserDays)
    .where(eq(bowserDays.day, day))
    .limit(1);
  return rows.length === 0 ? "ordinary" : "bowser";
}
