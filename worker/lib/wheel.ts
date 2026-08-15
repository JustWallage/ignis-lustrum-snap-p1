import { and, asc, eq } from "drizzle-orm";
import { bowserDays, prizes } from "../../db/schema";
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

export async function prizeSetForDay(db: Db, day: number): Promise<PrizeSet> {
  const rows = await db
    .select({ day: bowserDays.day })
    .from(bowserDays)
    .where(eq(bowserDays.day, day))
    .limit(1);
  return rows.length === 0 ? "ordinary" : "bowser";
}
