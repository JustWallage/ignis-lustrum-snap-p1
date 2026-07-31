import { z } from "zod";
import { eventStateSchema } from "./events";
import { MESSAGE_MAX_CHARS, presencePlayerSchema } from "./presence";
import { gameStateSchema } from "./state";

export const wsEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("photo_created"), id: z.int() }),
  z.object({ type: z.literal("photo_deleted"), id: z.int() }),
  z.object({ type: z.literal("photo_liked"), id: z.int() }),
  z.object({ type: z.literal("comment_created"), photoId: z.int() }),
  z.object({ type: z.literal("comment_deleted"), photoId: z.int() }),
  z.object({ type: z.literal("votes_changed"), day: z.int() }),
  z.object({ type: z.literal("prizes_changed") }),
  z.object({ type: z.literal("avatar_changed") }),
  z.object({ type: z.literal("state_changed"), state: gameStateSchema }),
  z.object({ type: z.literal("event_changed"), state: eventStateSchema }),
  z.object({
    type: z.literal("presence_here"),
    players: z.array(presencePlayerSchema),
  }),
  z.object({ type: z.literal("presence_moved"), player: presencePlayerSchema }),
  z.object({
    type: z.literal("presence_said"),
    id: z.string(),
    text: z.string().max(MESSAGE_MAX_CHARS),
  }),
  z.object({ type: z.literal("presence_left"), id: z.string() }),
]);

export type WsEvent = z.infer<typeof wsEventSchema>;
export type WsEventType = WsEvent["type"];

/** DERIVED from the union: a forgotten array entry would fail silently. */
export const WS_EVENT_TYPES: WsEventType[] = wsEventSchema.options.map(
  (option) => option.shape.type.value,
);

/** Presence is EXCLUDED: a walking friend sends a frame every 170 ms, and
 * revalidating the day, the ballot and the comments on each would turn a stroll into a
 * load test. */
export const REVALIDATE_EVENT_TYPES: WsEventType[] = WS_EVENT_TYPES.filter(
  (type) => !type.startsWith("presence_"),
);
