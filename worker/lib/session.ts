import { setCookie } from "hono/cookie";
import { SESSION_TTL_SECONDS } from "./auth";

/** The ONE place the cookie is written, and `maxAge` is the JWT's own lifetime. */
export function setSessionCookie(
  c: Parameters<typeof setCookie>[0],
  token: string,
): void {
  const isSecure = new URL(c.req.url).protocol === "https:";
  setCookie(c, "token", token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? "Strict" : "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}
