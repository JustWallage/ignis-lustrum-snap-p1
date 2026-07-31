import { z } from "zod";

export const gamePhaseSchema = z.enum([
  "submission",
  "countdown",
  "reveal",
  "wheel",
]);
export type GamePhase = z.infer<typeof gamePhaseSchema>;

export const gameStateSchema = z.object({
  day: z.int().positive(),
  phase: gamePhaseSchema,
  submissionCount: z.int().nonnegative(),
});
export type GameState = z.infer<typeof gameStateSchema>;
