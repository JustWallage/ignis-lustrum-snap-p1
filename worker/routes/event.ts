import { Hono } from "hono";
import type { AppEnv } from "../env";
import { isAdmin } from "../lib/auth";
import {
  abortEvent,
  advancePodium,
  readEventState,
  spinWheel,
  startEvent,
} from "../lib/event";

export const eventRoute = new Hono<AppEnv>();

eventRoute.get("/", async (c) => {
  return c.json(await readEventState(c.env));
});

export const adminEventRoutes = new Hono<AppEnv>();

adminEventRoutes.use("*", async (c, next) => {
  if (!isAdmin(c.get("user").name, c.env.ADMIN_NAMES)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return next();
});

adminEventRoutes.post("/start", async (c) => {
  const outcome = await startEvent(c.env, c.get("user").id);
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
  return c.json(outcome.event);
});

adminEventRoutes.post("/abort", async (c) => {
  const outcome = await abortEvent(c.env);
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
  return c.json(outcome.event);
});

adminEventRoutes.post("/next", async (c) => {
  const outcome = await advancePodium(c.env, c.get("user").id);
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
  return c.json(outcome.event);
});

export const eventSpinRoutes = new Hono<AppEnv>();

eventSpinRoutes.post("/spin", async (c) => {
  const outcome = await spinWheel(c.env, c.get("user").id);
  if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
  return c.json(outcome.event);
});
