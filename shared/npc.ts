import { z } from "zod";

export const NPC_NAME = "Chris";

export const NPC_REACTION_MAX = 80;
export const NPC_QUESTION_MAX = 80;

export const NPC_OPTION_MAX = 28;

export const NPC_OPTIONS_MAX = 3;

export const NPC_SAID_MAX = 120;

export const NPC_LINE_MAX = 240;

export const NPC_TURNS_MAX = 8;

const NPC_TURNS_CEILING = 100;

export const npcTurnSchema = z.object({
  role: z.enum(["player", "npc"]),
  text: z.string().trim().min(1).max(NPC_LINE_MAX),
});
export type NpcTurn = z.infer<typeof npcTurnSchema>;

export const npcChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(NPC_SAID_MAX),
  turns: z.array(npcTurnSchema).max(NPC_TURNS_CEILING),
});

export const npcChatResponseSchema = z.object({
  reaction: z.string().min(1).max(NPC_REACTION_MAX),
  question: z.string().min(1).max(NPC_QUESTION_MAX),
  options: z
    .array(z.string().min(1).max(NPC_OPTION_MAX))
    .min(1)
    .max(NPC_OPTIONS_MAX),
  turns: z.array(npcTurnSchema),
});

export function recentTurns(turns: readonly NpcTurn[]): NpcTurn[] {
  return turns.slice(-NPC_TURNS_MAX);
}

export function capLine(text: string, max: number = NPC_LINE_MAX): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

export function capOptions(options: readonly string[]): string[] {
  return options
    .map((option) => capLine(option, NPC_OPTION_MAX))
    .filter((option) => option !== "")
    .slice(0, NPC_OPTIONS_MAX);
}
