import { Hono } from "hono";
import { meSchema } from "../shared/api";
import type { AppEnv } from "./env";
import { isAdmin } from "./lib/auth";
import { avatarKeyFor } from "./lib/avatar";
import { rememberGameState } from "./lib/broadcast";
import { getDb } from "./lib/db";
import { readGameState } from "./lib/game-state";
import { presenceUpgrade } from "./lib/presence";
import { authMiddleware, optionalUser } from "./middleware/auth";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { avatarRoutes } from "./routes/avatar";
import { commentsRoutes } from "./routes/comments";
import { daysRoutes } from "./routes/days";
import { adminEventRoutes, eventRoute, eventSpinRoutes } from "./routes/event";
import { leaderboardRoutes } from "./routes/leaderboard";
import { npcRoutes } from "./routes/npc";
import { photosRoutes } from "./routes/photos";
import { prizesRoutes } from "./routes/prizes";
import { SPRITE_PATH, spriteRoutes, spriteUrl } from "./routes/sprites";
import { stateRoute } from "./routes/state";
import { testAvatarRoute } from "./routes/test-avatar";
import { testCaptionRoute } from "./routes/test-caption";
import { testDayRoute } from "./routes/test-day";
import { testPhaseRoute } from "./routes/test-phase";
import { testQuotaRoute } from "./routes/test-quota";
import { testResetRoute } from "./routes/test-reset";
import { townAvatarRoutes } from "./routes/town-avatars";
import { votesRoutes } from "./routes/votes";

export const app = new Hono<AppEnv>();

// Registration order is LOAD-BEARING: Hono runs matched handlers in registration
// order, so everything above `app.use("/api/*", authMiddleware)` is the public surface
// and everything below is behind the cookie.
app.get("/api/ws", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.json({ error: "Expected WebSocket upgrade" }, 426);
  }
  await rememberGameState(c.env, await readGameState(getDb(c.env)));
  const stub = c.env.REALTIME_DO.get(c.env.REALTIME_DO.idFromName("global"));
  const user = await optionalUser(c);
  const key = user === null ? null : await avatarKeyFor(getDb(c.env), user.id);
  return stub.fetch(
    presenceUpgrade(user, key === null ? null : spriteUrl(key)),
  );
});

app.route("/api", authRoutes);

app.route("/api/state", stateRoute);

app.route("/api/event", eventRoute);

app.use("/api/*", authMiddleware);

app.route("/api/admin/event", adminEventRoutes);

app.route("/api/event", eventSpinRoutes);

app.get("/api/me", (c) => {
  const user = c.get("user");
  return c.json(
    meSchema.parse({ user, isAdmin: isAdmin(user.name, c.env.ADMIN_NAMES) }),
  );
});

app.route("/api/admin", adminRoutes);

// Before the photos router, so /api/photos/:id/comments resolves to it.
app.route("/api/photos/:id/comments", commentsRoutes);
app.route("/api/photos", photosRoutes);
app.route("/api/prizes", prizesRoutes);

app.route("/api/votes", votesRoutes);
app.route("/api/days", daysRoutes);
app.route("/api/leaderboard", leaderboardRoutes);

app.route("/api/avatar", avatarRoutes);
app.route("/api/avatars", townAvatarRoutes);

app.route(SPRITE_PATH, spriteRoutes);

app.route("/api/npc", npcRoutes);

// Fail closed: anything that is not exactly e2e/local — including an unknown
// ENVIRONMENT — gets a 404.
app.use("/api/test/*", async (c, next) => {
  if (c.env.ENVIRONMENT !== "e2e" && c.env.ENVIRONMENT !== "local") {
    return c.json({ error: "Not found" }, 404);
  }
  return next();
});
app.route("/api/test/reset", testResetRoute);
app.route("/api/test/phase", testPhaseRoute);
app.route("/api/test/day", testDayRoute);
app.route("/api/test/avatar", testAvatarRoute);
app.route("/api/test/caption", testCaptionRoute);
app.route("/api/test/quota", testQuotaRoute);

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
} satisfies ExportedHandler<Env>;

export { RealtimeDO } from "./do/RealtimeDO";
