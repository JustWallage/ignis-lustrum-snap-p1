import { Hono } from "hono";
import { putRecordSchema } from "../../shared/jukebox";
import type { AppEnv } from "../env";
import { parseJsonBody } from "../lib/http";
import { setRecord } from "../lib/jukebox";

export const jukeboxRoutes = new Hono<AppEnv>();

const NOT_A_RECORD = "That is not a record this jukebox can play.";

jukeboxRoutes.post("/", async (c) => {
  const press = putRecordSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!press.success) return c.json({ error: NOT_A_RECORD }, 400);
  const outcome = await setRecord(c.env, c.get("user").id, press.data);
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
  return c.json(outcome.jukebox);
});

jukeboxRoutes.delete("/", async (c) => {
  const outcome = await setRecord(c.env, c.get("user").id, null);
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
  return c.json(outcome.jukebox);
});
