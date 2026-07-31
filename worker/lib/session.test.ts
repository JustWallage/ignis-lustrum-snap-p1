import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { app } from "../index";
import { daysLater, resetWorld, signIn } from "../test-helpers";
import { SESSION_TTL_SECONDS } from "./auth";

// The cookie's `maxAge` and the JWT's `exp` are one constant. If they drift, a browser
// drops a cookie the worker would still accept — a silent short session, not a failure.

const jwtBodySchema = z.object({ iat: z.number(), exp: z.number() });

function tokenLifetime(token: string): number {
  const body = token.split(".")[1];
  if (body === undefined) throw new Error("not a JWT");
  const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
  const { iat, exp } = jwtBodySchema.parse(JSON.parse(json));
  return exp - iat;
}

function maxAgeOf(setCookie: string): number {
  const found = /Max-Age=(-?\d+)/i.exec(setCookie);
  if (found?.[1] === undefined) throw new Error(`no Max-Age in ${setCookie}`);
  return Number(found[1]);
}

function tokenOf(setCookie: string): string {
  return setCookie.split(";")[0]?.slice("token=".length) ?? "";
}

async function loginCookie(): Promise<string> {
  await app.request("/api/seed", { method: "POST" }, env);
  const res = await app.request(
    "/api/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "tester", password: "test-password-123" }),
    },
    env,
  );
  const header = res.headers.get("set-cookie");
  if (header === null) throw new Error("login set no cookie");
  return header;
}

beforeEach(resetWorld);

describe("the session cookie", () => {
  it("expires exactly when the token it carries does", async () => {
    const header = await loginCookie();
    expect(maxAgeOf(header)).toBe(SESSION_TTL_SECONDS);
    expect(tokenLifetime(tokenOf(header))).toBe(SESSION_TTL_SECONDS);
    expect(maxAgeOf(header)).toBe(tokenLifetime(tokenOf(header)));
  });

  it("is written the same way on renewal as on login", async () => {
    const cookie = await signIn();
    const renewed = await daysLater(24, async () => {
      const res = await app.request(
        "/api/me",
        { headers: { Cookie: cookie } },
        env,
      );
      return res.headers.get("set-cookie");
    });
    if (renewed === null) throw new Error("expected a renewed session cookie");
    expect(maxAgeOf(renewed)).toBe(tokenLifetime(tokenOf(renewed)));
    expect(maxAgeOf(renewed)).toBe(SESSION_TTL_SECONDS);
  });

  it("is HttpOnly and scoped to the whole site", async () => {
    const header = await loginCookie();
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Path=/");
    expect(header).toMatch(/SameSite=(Lax|Strict)/);
  });
});
