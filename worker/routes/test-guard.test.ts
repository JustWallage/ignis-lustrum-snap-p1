import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../index";
import { resetWorld, signIn } from "../test-helpers";

function envWith(environment: string) {
  return { ...env, ENVIRONMENT: environment };
}

const TEST_ROUTES = [
  "/api/test/reset",
  "/api/test/phase",
  "/api/test/day",
  "/api/test/avatar",
  "/api/test/caption",
  "/api/test/quota",
];

beforeEach(resetWorld);

describe("the test-only surface", () => {
  it("answers in the environments the E2E suite runs in", async () => {
    const cookie = await signIn();
    for (const environment of ["local", "e2e"]) {
      const res = await app.request(
        "/api/test/reset",
        { method: "POST", headers: { Cookie: cookie } },
        envWith(environment),
      );
      expect(res.status).toBe(200);
    }
  });

  it("404s in production, cookie or not", async () => {
    const cookie = await signIn();
    for (const path of TEST_ROUTES) {
      const res = await app.request(
        path,
        {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "wheel" }),
        },
        envWith("production"),
      );
      expect(res.status).toBe(404);
    }
  });

  it("fails closed on an environment it has never heard of", async () => {
    // The point of the guard: unknown values are production, not local. A typo
    // in a deployment's ENVIRONMENT must not open the reset route.
    const cookie = await signIn();
    for (const environment of ["staging", "", "LOCAL"]) {
      const res = await app.request(
        "/api/test/reset",
        { method: "POST", headers: { Cookie: cookie } },
        envWith(environment),
      );
      expect(res.status).toBe(404);
    }
  });

  it("still needs a session, so it is not a hole in the auth middleware", async () => {
    const res = await app.request(
      "/api/test/reset",
      { method: "POST" },
      envWith("local"),
    );
    expect(res.status).toBe(401);
  });
});
