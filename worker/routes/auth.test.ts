import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../index";
import { resetWorld, signIn } from "../test-helpers";

async function logout(headers: Record<string, string> = {}): Promise<Response> {
  return app.request("/api/logout", { method: "POST", headers }, env);
}

beforeEach(resetWorld);

describe("logout", () => {
  it("clears the session cookie", async () => {
    const cookie = await signIn();
    const res = await logout({ Cookie: cookie });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie");
    if (setCookie === null) throw new Error("logout set no cookie");
    expect(setCookie).toContain("token=;");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");
  });

  it("leaves the browser unable to reach anything private", async () => {
    const cookie = await signIn();
    await logout({ Cookie: cookie });
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: "token=" } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("is public, like the rest of the auth surface", async () => {
    expect((await logout()).status).toBe(200);
  });

  it("does not revoke the token itself — there is no server-side revocation", async () => {
    // The documented trade for a group of 14 friends: logout is a browser-side
    // erase, and a leaked token stays valid until it expires. If this ever
    // starts failing, someone added revocation and CLAUDE.md needs updating.
    const cookie = await signIn();
    await logout({ Cookie: cookie });
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
  });
});
