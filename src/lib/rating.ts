import { AI_SCORE_MAX } from "@shared/scoring";

// The ONE place the rating's wording lives. Every surface printing it reads it from
// here, and independently written "AI n/10" strings are how the readout drifted in the
// first place (#97). Nothing here computes anything.

export function ratingText(aiScore: number | null): string {
  if (aiScore === null) return "NOT SCORED";
  return `${String(aiScore)}/${String(AI_SCORE_MAX)}`;
}

/**
 * The curved half, LABELLED as curved: the day's best always lands on exactly
 * `HALF_WEIGHT`, so printing it under a bare "AI" is the whole of #97.
 */
export function curvedText(aiNorm: number): string {
  return `CURVED ${String(Math.round(aiNorm))}`;
}

export function isFallbackRating(aiStatus: "ok" | "failed" | null): boolean {
  return aiStatus === "failed";
}
