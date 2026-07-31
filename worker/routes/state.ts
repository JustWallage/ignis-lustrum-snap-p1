import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../lib/db";
import { readGameState } from "../lib/game-state";

export const stateRoute = new Hono<AppEnv>();

stateRoute.get("/", async (c) => {
  return c.json(await readGameState(getDb(c.env)));
});
