import { z } from "zod";
import { eventStateSchema, type EventState } from "../../shared/events";
import type { GamePhase } from "../../shared/state";
import type { Bindings } from "../env";

const eventOutcomeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), event: eventStateSchema }),
  z.object({
    ok: z.literal(false),
    status: z.union([z.literal(403), z.literal(409)]),
    error: z.string(),
  }),
]);
export type EventOutcome = z.infer<typeof eventOutcomeSchema>;

function realtime(env: Bindings) {
  return env.REALTIME_DO.get(env.REALTIME_DO.idFromName("global"));
}

export async function readEventState(env: Bindings): Promise<EventState> {
  return eventStateSchema.parse(await realtime(env).readEvent());
}

export async function startEvent(
  env: Bindings,
  hostUserId: number,
): Promise<EventOutcome> {
  return eventOutcomeSchema.parse(await realtime(env).startEvent(hostUserId));
}

export async function advancePodium(
  env: Bindings,
  userId: number,
): Promise<EventOutcome> {
  return eventOutcomeSchema.parse(await realtime(env).advancePodium(userId));
}

export async function abortEvent(env: Bindings): Promise<EventOutcome> {
  return eventOutcomeSchema.parse(await realtime(env).abortEvent());
}

export async function spinWheel(
  env: Bindings,
  userId: number,
): Promise<EventOutcome> {
  return eventOutcomeSchema.parse(await realtime(env).spinWheel(userId));
}

export async function setEventPhase(
  env: Bindings,
  phase: GamePhase,
): Promise<EventState> {
  return eventStateSchema.parse(await realtime(env).setEventPhase(phase));
}
