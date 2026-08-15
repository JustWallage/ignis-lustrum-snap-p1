import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { bowserDaysSchema } from "../../shared/api";
import { app } from "../index";
import { markBowserDay, resetWorld, signIn } from "../test-helpers";

beforeEach(resetWorld);

const PATH = "/api/admin/bowser";

async function markedDays(cookie: string, bindings: object = env) {
  const res = await app.request(
    PATH,
    { headers: { Cookie: cookie } },
    bindings,
  );
  expect(res.status).toBe(200);
  return bowserDaysSchema.parse(await res.json()).days;
}

function unmark(cookie: string, day: number, bindings: object = env) {
  return app.request(
    `${PATH}/${String(day)}`,
    { method: "DELETE", headers: { Cookie: cookie } },
    bindings,
  );
}

function asFriend(): object {
  return { ...env, ADMIN_NAMES: "someone-else" };
}

describe("the operator's Bowser days", () => {
  it("marks a day, names who marked it, and reads it back in order", async () => {
    const admin = await signIn("tester");
    expect(await markedDays(admin)).toEqual([]);

    expect((await markBowserDay(admin, 5)).status).toBe(200);
    expect((await markBowserDay(admin, 2)).status).toBe(200);

    const days = await markedDays(admin);
    expect(days.map((one) => one.day)).toEqual([2, 5]);
    expect(days[0]?.markedBy.name).toBe("tester");
  });

  // The unique index is the enforcement, so the second press is the same marked day
  // rather than a refusal an operator has to make sense of.
  it("takes the same day twice as one marked day", async () => {
    const admin = await signIn("tester");
    expect((await markBowserDay(admin, 3)).status).toBe(200);
    expect((await markBowserDay(admin, 3)).status).toBe(200);
    expect((await markedDays(admin)).map((one) => one.day)).toEqual([3]);
  });

  it("unmarks one day and leaves the rest marked", async () => {
    const admin = await signIn("tester");
    for (const day of [1, 4]) {
      expect((await markBowserDay(admin, day)).status).toBe(200);
    }
    expect((await unmark(admin, 1)).status).toBe(200);
    expect((await markedDays(admin)).map((one) => one.day)).toEqual([4]);

    // Unmarking a day nobody marked is the state the caller asked for.
    expect((await unmark(admin, 9)).status).toBe(200);
  });

  it("refuses a day that is not a whole number, 1 or more", async () => {
    const admin = await signIn("tester");
    for (const day of [0, -1, 1.5]) {
      expect((await markBowserDay(admin, day)).status).toBe(400);
    }
    expect((await unmark(admin, 0)).status).toBe(400);
    expect(await markedDays(admin)).toEqual([]);
  });

  it("is the admin's alone, to read as well as to write", async () => {
    const admin = await signIn("tester");
    expect((await markBowserDay(admin, 6)).status).toBe(200);

    const friend = asFriend();
    expect(
      (await app.request(PATH, { headers: { Cookie: admin } }, friend)).status,
    ).toBe(403);
    const posted = await app.request(
      PATH,
      {
        method: "POST",
        headers: { Cookie: admin, "Content-Type": "application/json" },
        body: JSON.stringify({ day: 7 }),
      },
      friend,
    );
    expect(posted.status).toBe(403);
    expect((await unmark(admin, 6, friend)).status).toBe(403);

    expect((await markedDays(admin)).map((one) => one.day)).toEqual([6]);
  });

  it("needs a session at all", async () => {
    expect((await app.request(PATH, {}, env)).status).toBe(401);
  });
});
