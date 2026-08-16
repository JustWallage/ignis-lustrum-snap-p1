import { AI_SCORE_MAX } from "@shared/scoring";

// The ONE place the rating's wording lives. Every surface printing it reads it from
// here, and independently written "AI n/10" strings are how the readout drifted in the
// first place (#97). Nothing here computes anything.

export function ratingText(aiScore: number | null): string {
  if (aiScore === null) return "NOT SCORED";
  return `${String(aiScore)}/${String(AI_SCORE_MAX)}`;
}

/**
 * The jury half, LABELLED so it cannot be read as a rating: it is a POSITION in the
 * day's field, where first place lands on exactly `HALF_WEIGHT`, and printing it under
 * a bare "AI" is the whole of #97. The player-facing word stays CURVED.
 */
export function curvedText(aiNorm: number): string {
  return `CURVED ${String(Math.round(aiNorm))}`;
}

export function isFallbackRating(aiStatus: "ok" | "failed" | null): boolean {
  return aiStatus === "failed";
}
