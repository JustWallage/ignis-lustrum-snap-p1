import { z } from "zod";
import { jukeboxStateSchema, type PutRecord } from "../../shared/jukebox";
import type { Bindings } from "../env";

/** Its OWN outcome union rather than `EventOutcome`, whose refusal is `403 | 409`: every
 * refusal here is a 409, and widening that one in passing is what this avoids. */
const jukeboxOutcomeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), jukebox: jukeboxStateSchema }),
  z.object({ ok: z.literal(false), status: z.literal(409), error: z.string() }),
]);

export type JukeboxOutcome = z.infer<typeof jukeboxOutcomeSchema>;

/** `null` stops whatever is on: ONE call for both presses, so they cannot drift apart over
 * who may press and how often. */
export async function setRecord(
  env: Bindings,
  userId: number,
  press: PutRecord | null,
): Promise<JukeboxOutcome> {
  const stub = env.REALTIME_DO.get(env.REALTIME_DO.idFromName("global"));
  return jukeboxOutcomeSchema.parse(await stub.setRecord(userId, press));
}
