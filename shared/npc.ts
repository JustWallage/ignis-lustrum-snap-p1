import { z } from "zod";

const npcKindSchema = z.enum(["neighbour", "guide"]);
export type NpcKind = z.infer<typeof npcKindSchema>;

export const NPC_NAMES: Record<NpcKind, string> = {
  neighbour: "Chris",
  guide: "Nico",
};

/**
 * The guide's reaction IS the answer — a day's transport, its times and its activity —
 * where the neighbour's is one line of gossip, so the dialogue box's three pages are
 * his to fill and one line is the neighbour's whole joke. The schema below bounds the
 * WIRE at the larger of the two; which cap a turn actually takes is decided by who
 * spoke, in `capSaid`.
 */
export const NPC_REACTION_MAX: Record<NpcKind, number> = {
  neighbour: 80,
  guide: 240,
};

const REACTION_CEILING = Math.max(...Object.values(NPC_REACTION_MAX));

export const NPC_QUESTION_MAX = 80;

export const NPC_OPTION_MAX = 28;

export const NPC_OPTIONS_MAX = 3;

export const NPC_SAID_MAX = 120;

export const NPC_LINE_MAX = 360;

export const NPC_TURNS_MAX = 8;

const NPC_TURNS_CEILING = 100;

export const npcTurnSchema = z.object({
  role: z.enum(["player", "npc"]),
  text: z.string().trim().min(1).max(NPC_LINE_MAX),
});
export type NpcTurn = z.infer<typeof npcTurnSchema>;

export const npcChatRequestSchema = z.object({
  who: npcKindSchema,
  message: z.string().trim().min(1).max(NPC_SAID_MAX),
  turns: z.array(npcTurnSchema).max(NPC_TURNS_CEILING),
});

export const npcChatResponseSchema = z.object({
  reaction: z.string().min(1).max(REACTION_CEILING),
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
