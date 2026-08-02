import { z } from "zod";
import { directionSchema, MAP_H, MAP_W } from "./map";

export const presencePlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  x: z
    .int()
    .min(0)
    .max(MAP_W - 1),
  y: z
    .int()
    .min(0)
    .max(MAP_H - 1),
  facing: directionSchema,
  sprite: z.string().nullable(),
});

export type PresencePlayer = z.infer<typeof presencePlayerSchema>;

export const presenceMoveSchema = z.object({
  type: z.literal("presence"),
  x: presencePlayerSchema.shape.x,
  y: presencePlayerSchema.shape.y,
  facing: directionSchema,
});

export type PresenceMove = z.infer<typeof presenceMoveSchema>;

export const MESSAGE_MAX_CHARS = 40;

export const presenceSaySchema = z.object({
  type: z.literal("say"),
  text: z
    .string()
    .min(1)
    .max(MESSAGE_MAX_CHARS)
    .refine((text) => text.trim() !== "", "a message has to say something"),
});

export const presenceTalkStartSchema = z.object({
  type: z.literal("talk_start"),
});

export const presenceTalkEndSchema = z.object({ type: z.literal("talk_end") });

export const presenceFrameSchema = z.discriminatedUnion("type", [
  presenceMoveSchema,
  presenceSaySchema,
  presenceTalkStartSchema,
  presenceTalkEndSchema,
]);

/** A tab that dies without a close frame leaves a socket the runtime still believes
 * in, so the repeat is what proves a player is there. */
export const PRESENCE_PING_MS = 20_000;

/** Three missed repeats. Two is a hiccup; three is a ghost. */
const PRESENCE_TTL_MS = 3 * PRESENCE_PING_MS;

/** A walking client sends one frame per landed step (170 ms), so this never drops a
 * real step — it caps a scripted socket at ten a second. */
const PRESENCE_MIN_INTERVAL_MS = 100;

export function isPresenceStale(seenAt: number, now: number): boolean {
  return now - seenAt >= PRESENCE_TTL_MS;
}

export function isPresenceTooSoon(seenAt: number, now: number): boolean {
  return now - seenAt < PRESENCE_MIN_INTERVAL_MS;
}

const SAY_MIN_INTERVAL_MS = 1_000;

export function isSayTooSoon(saidAt: number | null, now: number): boolean {
  return saidAt !== null && now - saidAt < SAY_MIN_INTERVAL_MS;
}

export const TALK_MAX_MS = 20_000;

/** Many chunks of silence at the ~85 ms `src/lib/voice.ts` sends at, so ordinary jitter
 * is never read as a dead tab. The channel has no other way back: a tab that dies
 * mid-sentence sends no `talk_end`. */
const TALK_SILENCE_MS = 1_500;

const TALK_MIN_INTERVAL_MS = 800;

/** A capture frame is ~1.4 kB at the rate `src/lib/voice.ts` sends; the platform would
 * take 1 MiB, which is not what this needs. */
export const TALK_FRAME_MAX_BYTES = 4_096;

export interface Talking {
  since: number;
  heardAt: number;
}

export function isTalkOver(talking: Talking, now: number): boolean {
  return (
    now - talking.since >= TALK_MAX_MS ||
    now - talking.heardAt >= TALK_SILENCE_MS
  );
}

export function isTalkTooSoon(talkedAt: number | null, now: number): boolean {
  return talkedAt !== null && now - talkedAt < TALK_MIN_INTERVAL_MS;
}
