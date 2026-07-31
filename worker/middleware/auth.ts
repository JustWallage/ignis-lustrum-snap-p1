import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv, SessionUser } from "../env";
import { createJWT, needsRenewal, verifyJWT, type Session } from "../lib/auth";
import { setSessionCookie } from "../lib/session";

async function readSession(c: Context<AppEnv>): Promise<Session | null> {
  const token = getCookie(c, "token");
  if (token === undefined || token === "") return null;
  return verifyJWT(token, c.env.JWT_SECRET);
}

export async function optionalUser(
  c: Context<AppEnv>,
): Promise<SessionUser | null> {
  const session = await readSession(c);
  return session === null ? null : { id: session.userId, name: session.name };
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const session = await readSession(c);
  if (session === null) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", { id: session.userId, name: session.name });
  await next();
  // After the handler on purpose: by then `c.res` is the real response, so the
  // cookie survives routes that return a Response directly (image bytes).
  if (needsRenewal(session)) {
    const renewed = await createJWT(
      { userId: session.userId, name: session.name },
      c.env.JWT_SECRET,
    );
    setSessionCookie(c, renewed);
  }
});
