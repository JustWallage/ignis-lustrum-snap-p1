import { AI_SCORE_MAX } from "@shared/scoring";

// The ONE place the rating's wording lives. Every surface printing it reads it from
// here, and independently written "AI n/10" strings are how the readout drifted in the
// first place (#97). Nothing here computes anything.

export function ratingText(aiScore: number | null): string {
  if (aiScore === null) return "NOT SCORED";
  return `${String(aiScore)}/${String(AI_SCORE_MAX)}`;
}

/** The number is a POSITION in the day's field, not a curve — CURVED is the player's
 * word and stays, so nothing here follows `shared/scoring.ts` when the arithmetic
 * changes name. */
export function curvedText(aiNorm: number): string {
  return `CURVED ${String(Math.round(aiNorm))}`;
}

export function isFallbackRating(aiStatus: "ok" | "failed" | null): boolean {
  return aiStatus === "failed";
}
