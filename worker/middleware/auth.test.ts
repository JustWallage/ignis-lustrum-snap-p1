import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { meSchema } from "../../shared/api";
import { app } from "../index";
import { SESSION_TTL_SECONDS, verifyJWT } from "../lib/auth";
import {
  daysLater,
  jwtSecret,
  resetWorld,
  signIn,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

describe("auth", () => {
  it("rejects unauthenticated uploads", async () => {
    const res = await app.request("/api/photos", { method: "POST" }, env);
    expect(res.status).toBe(401);
  });

  it("returns the signed-in user from /api/me", async () => {
    const cookie = await signIn();
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    const me = meSchema.parse(await res.json());
    expect(me.user.name).toBe("tester");
    expect(me.isAdmin).toBe(true);
  });

  it("slides a session that is inside its last week onto a fresh 30 days", async () => {
    const cookie = await signIn();
    const { setCookie, remaining } = await daysLater(24, async () => {
      const res = await app.request(
        "/api/me",
        { headers: { Cookie: cookie } },
        env,
      );
      expect(res.status).toBe(200);
      const header = res.headers.get("set-cookie");
      if (header === null) throw new Error("expected a renewed session cookie");

      const renewed = header.split(";")[0]?.slice("token=".length) ?? "";
      expect(renewed).not.toBe(cookie.slice("token=".length));
      const session = await verifyJWT(renewed, jwtSecret());
      if (session === null)
        throw new Error("the renewed token does not verify");
      expect(session.name).toBe("tester");

      return {
        setCookie: header,
        remaining: session.exp - Math.floor(Date.now() / 1000),
      };
    });
    expect(remaining).toBe(SESSION_TTL_SECONDS);
    expect(setCookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
    expect(setCookie).toContain("HttpOnly");
  });

  it("does not re-issue a cookie while the token has plenty of life left", async () => {
    const cookie = await signIn();
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("renews on a route that returns a Response directly", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    // Image loads are the bulk of authenticated traffic and bypass c.json(), so
    // the renewal has to survive them too.
    const res = await daysLater(24, async () =>
      app.request(
        `/api/photos/${id}/image`,
        { headers: { Cookie: cookie } },
        env,
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(
      `Max-Age=${SESSION_TTL_SECONDS}`,
    );
  });

  it("401s an expired token instead of renewing it", async () => {
    const cookie = await signIn();
    const res = await daysLater(31, async () =>
      app.request("/api/me", { headers: { Cookie: cookie } }, env),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
