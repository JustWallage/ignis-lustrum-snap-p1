import { describe, expect, it } from "vitest";
import {
  createJWT,
  hashPassword,
  isAdmin,
  needsRenewal,
  SESSION_TTL_SECONDS,
  verifyJWT,
  verifyPassword,
} from "./auth";

const DAY = 24 * 60 * 60;
const nowSeconds = () => Math.floor(Date.now() / 1000);

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const { hash, salt } = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", hash, salt)).toBe(true);
    expect(await verifyPassword("wrong", hash, salt)).toBe(false);
  });

  it("produces a different salt each time", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a.salt).not.toBe(b.salt);
  });
});

describe("session tokens", () => {
  it("round-trips a payload and lasts 30 days", async () => {
    const issuedAt = nowSeconds();
    const token = await createJWT({ userId: 7, name: "just" }, "secret");
    const session = await verifyJWT(token, "secret");
    expect(session).toMatchObject({ userId: 7, name: "just" });
    expect(session?.exp).toBeGreaterThanOrEqual(issuedAt + SESSION_TTL_SECONDS);
    expect(SESSION_TTL_SECONDS).toBe(30 * DAY);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createJWT({ userId: 7, name: "just" }, "secret");
    expect(await verifyJWT(token, "other-secret")).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifyJWT("not.a.jwt", "secret")).toBeNull();
  });
});

describe("needsRenewal", () => {
  const session = (secondsLeft: number) => ({
    userId: 7,
    name: "just",
    exp: nowSeconds() + secondsLeft,
  });

  it("renews inside the last week and not before it", () => {
    expect(needsRenewal(session(SESSION_TTL_SECONDS))).toBe(false);
    expect(needsRenewal(session(8 * DAY))).toBe(false);
    expect(needsRenewal(session(6 * DAY))).toBe(true);
    expect(needsRenewal(session(60))).toBe(true);
  });
});

describe("isAdmin", () => {
  it("matches names in the comma-separated list", () => {
    expect(isAdmin("just", "just, bob")).toBe(true);
    expect(isAdmin("eve", "just, bob")).toBe(false);
  });
});
