import { asc, eq } from "drizzle-orm";
import { prizes } from "../../db/schema";
import type { Db } from "./db";

/** `sort_order` is admin-assigned and not unique, so `id` breaks the tie — the same
 * ordering the manager shows, so an operator can predict the wheel. */
export async function enabledPrizeLabels(db: Db): Promise<string[]> {
  const rows = await db
    .select({ label: prizes.label })
    .from(prizes)
    .where(eq(prizes.enabled, true))
    .orderBy(asc(prizes.sortOrder), asc(prizes.id));
  return rows.map((row) => row.label);
}
