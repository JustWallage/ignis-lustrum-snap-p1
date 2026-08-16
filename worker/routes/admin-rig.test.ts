import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { riggedDaysSchema } from "../../shared/api";
import { app } from "../index";
import {
  addPrize,
  prizeList,
  resetWorld,
  rigDay,
  signIn,
} from "../test-helpers";

beforeEach(resetWorld);

const PATH = "/api/admin/rig";

async function riggedDays(cookie: string, bindings: object = env) {
  const res = await app.request(
    PATH,
    { headers: { Cookie: cookie } },
    bindings,
  );
  expect(res.status).toBe(200);
  return riggedDaysSchema.parse(await res.json()).days;
}

function clearRig(cookie: string, day: number, bindings: object = env) {
  return app.request(
    `${PATH}/${String(day)}`,
    { method: "DELETE", headers: { Cookie: cookie } },
    bindings,
  );
}

function deletePrize(cookie: string, id: number) {
  return app.request(
    `/api/prizes/${String(id)}`,
    { method: "DELETE", headers: { Cookie: cookie } },
    env,
  );
}

describe("the operator's rigged landings", () => {
  it("rigs a day, names the prize and its set, and reads them back in order", async () => {
    const admin = await signIn("tester");
    expect(await riggedDays(admin)).toEqual([]);
    const prizes = await prizeList(admin);
    const [first, second] = prizes;
    if (first === undefined || second === undefined) {
      throw new Error("the seeded wheel is short");
    }

    expect((await rigDay(admin, 5, second.id)).status).toBe(200);
    expect((await rigDay(admin, 2, first.id)).status).toBe(200);

    const days = await riggedDays(admin);
    expect(days.map((one) => one.day)).toEqual([2, 5]);
    expect(days[0]?.prize).toEqual({
      id: first.id,
      label: first.label,
      set: "ordinary",
    });
    expect(days[0]?.riggedBy.name).toBe("tester");
  });

  it("names the Bowser set on a rig that picked one of its prizes", async () => {
    const admin = await signIn("tester");
    expect((await addPrize(admin, "Bowsers bed", "bowser")).status).toBe(201);
    const [beastly] = await prizeList(admin, "bowser");
    if (beastly === undefined) throw new Error("the Bowser list is empty");

    expect((await rigDay(admin, 1, beastly.id)).status).toBe(200);
    expect((await riggedDays(admin))[0]?.prize).toEqual({
      id: beastly.id,
      label: beastly.label,
      set: "bowser",
    });
  });

  it("holds ONE rig per day: rigging it again replaces the prize", async () => {
    const admin = await signIn("tester");
    const [first, second] = await prizeList(admin);
    if (first === undefined || second === undefined) {
      throw new Error("the seeded wheel is short");
    }

    expect((await rigDay(admin, 3, first.id)).status).toBe(200);
    expect((await rigDay(admin, 3, second.id)).status).toBe(200);

    const days = await riggedDays(admin);
    expect(days.map((one) => one.day)).toEqual([3]);
    expect(days[0]?.prize.id).toBe(second.id);
  });

  it("clears one day and leaves the rest rigged", async () => {
    const admin = await signIn("tester");
    const [prize] = await prizeList(admin);
    if (prize === undefined) throw new Error("the seeded wheel is empty");
    for (const day of [1, 4]) {
      expect((await rigDay(admin, day, prize.id)).status).toBe(200);
    }

    expect((await clearRig(admin, 1)).status).toBe(200);
    expect((await riggedDays(admin)).map((one) => one.day)).toEqual([4]);

    expect((await clearRig(admin, 9)).status).toBe(200);
  });

  it("refuses a day that is not a whole number, 1 or more", async () => {
    const admin = await signIn("tester");
    const [prize] = await prizeList(admin);
    if (prize === undefined) throw new Error("the seeded wheel is empty");
    for (const day of [0, -1, 1.5]) {
      expect((await rigDay(admin, day, prize.id)).status).toBe(400);
    }
    expect((await clearRig(admin, 0)).status).toBe(400);
    expect(await riggedDays(admin)).toEqual([]);
  });

  it("refuses a prize no row answers to", async () => {
    const admin = await signIn("tester");
    const [prize] = await prizeList(admin);
    if (prize === undefined) throw new Error("the seeded wheel is empty");

    expect((await rigDay(admin, 1, prize.id + 9000)).status).toBe(404);
    expect(await riggedDays(admin)).toEqual([]);
  });

  it("lets a rigged prize be deleted, and lists what is left of the rig as nothing", async () => {
    const admin = await signIn("tester");
    const [prize] = await prizeList(admin);
    if (prize === undefined) throw new Error("the seeded wheel is empty");
    expect((await rigDay(admin, 1, prize.id)).status).toBe(200);

    expect((await deletePrize(admin, prize.id)).status).toBe(200);
    expect(await riggedDays(admin)).toEqual([]);
  });

  it("is the admin's alone, to read as well as to write", async () => {
    const admin = await signIn("tester");
    const [prize] = await prizeList(admin);
    if (prize === undefined) throw new Error("the seeded wheel is empty");
    expect((await rigDay(admin, 6, prize.id)).status).toBe(200);

    const friend = { ...env, ADMIN_NAMES: "someone-else" };
    expect(
      (await app.request(PATH, { headers: { Cookie: admin } }, friend)).status,
    ).toBe(403);
    const posted = await app.request(
      PATH,
      {
        method: "POST",
        headers: { Cookie: admin, "Content-Type": "application/json" },
        body: JSON.stringify({ day: 7, prizeId: prize.id }),
      },
      friend,
    );
    expect(posted.status).toBe(403);
    expect((await clearRig(admin, 6, friend)).status).toBe(403);

    expect((await riggedDays(admin)).map((one) => one.day)).toEqual([6]);
  });

  it("needs a session at all", async () => {
    expect((await app.request(PATH, {}, env)).status).toBe(401);
  });
});
