import { count, eq } from "drizzle-orm";
import { gameState, photos } from "../../db/schema";
import {
  gamePhaseSchema,
  gameStateSchema,
  type GamePhase,
  type GameState,
} from "../../shared/state";
import type { Db } from "./db";

const GAME_STATE_ID = 1;

/**
 * UNEXECUTED, so the operator's clock can batch it with the award cleanup: a day set
 * back over a landed wheel with its `prize_awards` row left behind makes the replayed
 * landing roll its own batch back on `prize_awards_day_idx`, and the day then silently
 * refuses to turn over. It writes the DAY only — it used to reset `phase` too, which is
 * a second writer of the column `RealtimeDO` owns, and every caller already follows with
 * `setEventPhase`.
 */
export function setGameDayStatement(db: Db, day: number) {
  return db
    .update(gameState)
    .set({ day, updatedAt: new Date() })
    .where(eq(gameState.id, GAME_STATE_ID));
}

/** UNEXECUTED, so the landing can batch it with the award: a day incremented without
 * one is a prize nobody can claim. `from` rather than `to`, so a landing that runs
 * twice cannot compound. */
export function advanceDayStatement(db: Db, from: number) {
  return db
    .update(gameState)
    .set({ day: from + 1, updatedAt: new Date() })
    .where(eq(gameState.id, GAME_STATE_ID));
}

export async function setGamePhase(db: Db, phase: GamePhase): Promise<void> {
  await db
    .update(gameState)
    .set({ phase, updatedAt: new Date() })
    .where(eq(gameState.id, GAME_STATE_ID));
}

// Mirrors the migration's defaults. The row is seeded with the schema, so these
// only cover a database that lost it — reading the clock must not 500.
const INITIAL_DAY = 1;
const INITIAL_PHASE: GamePhase = "submission";

export function isDayRevealed(
  photoDay: number,
  { day, phase }: GameState,
): boolean {
  if (photoDay < day) return true;
  return photoDay === day && (phase === "reveal" || phase === "wheel");
}

export function revealedDays(state: GameState): number[] {
  const days: number[] = [];
  for (let day = 1; day <= state.day; day += 1) {
    if (isDayRevealed(day, state)) days.push(day);
  }
  return days;
}

export async function readGameState(db: Db): Promise<GameState> {
  const rows = await db
    .select()
    .from(gameState)
    .where(eq(gameState.id, GAME_STATE_ID))
    .limit(1);
  const row = rows[0];
  const day = row?.day ?? INITIAL_DAY;
  const counted = await db
    .select({ value: count() })
    .from(photos)
    .where(eq(photos.day, day));
  return gameStateSchema.parse({
    day,
    // A plain text column, so an unrecognised value reads as the initial phase
    // rather than 500ing a route anyone can reach without a cookie.
    phase: gamePhaseSchema.catch(INITIAL_PHASE).parse(row?.phase),
    submissionCount: counted[0]?.value ?? 0,
  });
}
