import { z } from "zod";
import { jukeboxStateSchema, type PutRecord } from "../../shared/jukebox";
import type { Bindings } from "../env";

/**
 * `worker/lib/event.ts` is the precedent, not `serialize.ts`: there is no D1 row behind a
 * record, so the response is the DO's own answer parsed through the `shared/` schema
 * rather than a `toX(row)` converter.
 *
 * `EventOutcome`'s refusal is `403 | 409` and every refusal here is a 409 — a live event
 * and a cooldown are both "not now" — so this names the one status rather than widening
 * that union in passing.
 */
const jukeboxOutcomeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), jukebox: jukeboxStateSchema }),
  z.object({ ok: z.literal(false), status: z.literal(409), error: z.string() }),
]);

export type JukeboxOutcome = z.infer<typeof jukeboxOutcomeSchema>;

/** `null` stops whatever is on. ONE call for both presses, so putting a record on and
 * taking it off cannot drift apart over who may do it and how often. */
export async function setRecord(
  env: Bindings,
  userId: number,
  press: PutRecord | null,
): Promise<JukeboxOutcome> {
  const stub = env.REALTIME_DO.get(env.REALTIME_DO.idFromName("global"));
  return jukeboxOutcomeSchema.parse(await stub.setRecord(userId, press));
}
