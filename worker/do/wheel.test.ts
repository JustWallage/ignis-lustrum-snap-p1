import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiErrorSchema } from "../../shared/api";
import type { EventState } from "../../shared/events";
import { MIN_ENABLED_PRIZES, SEED_PRIZES } from "../../shared/prizes";
import { gameStateSchema } from "../../shared/state";
import { app } from "../index";
import {
  aBowserWheel,
  addPrize,
  aWheel,
  BOWSER_PRIZES,
  currentDay,
  eventAction,
  fireEventAlarm,
  IDLE_EVENT,
  markBowserDay,
  openSocket,
  playUntil,
  postSpin,
  prizeList,
  readEvent,
  resetWorld,
  rigDay,
  runEventAlarm,
  setDay,
  signIn,
  storedAward,
} from "../test-helpers";

beforeEach(resetWorld);

async function afterTheBeast<T>(
  wheel: EventState,
  body: () => Promise<T>,
): Promise<T> {
  const endsAt = wheel.beastEndsAt;
  if (endsAt === null) throw new Error("that wheel came up with no beast");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(endsAt + 1);
  try {
    return await body();
  } finally {
    vi.useRealTimers();
  }
}

function landedOn(event: EventState): string {
  const label = event.segments[event.prizeIndex ?? -1];
  if (label === undefined) throw new Error("the wheel landed on no segment");
  return label;
}

async function patchPrize(
  cookie: string,
  id: number,
  body: object,
): Promise<void> {
  const res = await app.request(
    `/api/prizes/${String(id)}`,
    {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
  expect(res.status).toBe(200);
}

function prizeIdsOf(body: unknown): number[] {
  const parsed = z
    .object({ prizes: z.array(z.object({ id: z.int() })) })
    .parse(body);
  return parsed.prizes.map((prize) => prize.id);
}

describe("the prize wheel", () => {
  it("snapshots the enabled prizes when it opens, and waits for its winner", async () => {
    const { wheel } = await aWheel();
    expect(wheel.segments).toEqual([...SEED_PRIZES]);
    expect(wheel.spunAt).toBeNull();
    expect(wheel.prizeIndex).toBeNull();
    // An unspun wheel used to return no deadline, so the DO deleted its alarm and the
    // event hung until an admin aborted — which does not advance the day.
    expect(wheel.stageEndsAt).not.toBeNull();
    expect(await fireEventAlarm()).toBe(true);
    expect(await readEvent()).toEqual(wheel);
  });

  it("gives up on a winner who never turns up, without playing the day", async () => {
    const { wheel } = await aWheel();
    expect(await runEventAlarm()).toBe(true);
    expect(await readEvent()).toEqual({ ...IDLE_EVENT, day: wheel.day });
    expect(await currentDay()).toBe(1);
    expect(await storedAward(1)).toBeNull();
  });

  it("does not desync when an admin edits the prizes mid-event", async () => {
    const { wheel } = await aWheel();
    const admin = await signIn("tester");
    const res = await app.request(
      "/api/prizes",
      {
        method: "POST",
        headers: { Cookie: admin, "Content-Type": "application/json" },
        body: JSON.stringify({ label: "A late addition" }),
      },
      env,
    );
    expect(res.status).toBe(201);
    expect((await readEvent()).segments).toEqual(wheel.segments);
  });

  it("keeps a friend who is neither the winner nor the host off it, whatever their client thinks", async () => {
    const { loserCookie } = await aWheel("judge");
    const refused = await postSpin(loserCookie);
    expect(refused.status).toBe(403);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(
      /winner or tonight's host/i,
    );
    expect((await readEvent()).spunAt).toBeNull();
  });

  it("lets tonight's host turn it for a winner who has wandered off", async () => {
    const { hostCookie, wheel } = await aWheel("judge");
    expect(wheel.hostUserId).not.toBe(wheel.winnerUserId);

    expect((await postSpin(hostCookie)).status).toBe(200);
    const spun = await readEvent();
    expect(spun.spunAt).not.toBeNull();
    expect(spun.prizeIndex).not.toBeNull();
  });

  it("stands by the first spin whichever of the two pressed it", async () => {
    const { hostCookie, winnerCookie } = await aWheel("judge");
    expect((await postSpin(hostCookie)).status).toBe(200);
    const first = await readEvent();

    const again = await postSpin(winnerCookie);
    expect(again.status).toBe(409);
    expect(apiErrorSchema.parse(await again.json()).error).toMatch(/already/i);
    expect(await readEvent()).toEqual(first);
  });

  it("refuses a spin to a caller with no session at all", async () => {
    await aWheel();
    const res = await app.request("/api/event/spin", { method: "POST" }, env);
    expect(res.status).toBe(401);
  });

  it("picks the landing server-side and tells everyone the same one", async () => {
    const { winnerCookie, wheel } = await aWheel();
    const watching = await openSocket();

    const res = await postSpin(winnerCookie);
    expect(res.status).toBe(200);

    const spun = await readEvent();
    expect(spun.spunAt).not.toBeNull();
    expect(spun.prizeIndex).not.toBeNull();
    expect(spun.prizeIndex ?? -1).toBeGreaterThanOrEqual(0);
    expect(spun.prizeIndex ?? -1).toBeLessThan(wheel.segments.length);

    const frames = [await watching.next(), await watching.next()];
    expect(frames).toContainEqual({ type: "event_changed", state: spun });
  });

  it("stands by the first spin: a second press is a conflict, not a re-roll", async () => {
    const { winnerCookie } = await aWheel();
    expect((await postSpin(winnerCookie)).status).toBe(200);
    const first = await readEvent();

    const again = await postSpin(winnerCookie);
    expect(again.status).toBe(409);
    expect(apiErrorSchema.parse(await again.json()).error).toMatch(/already/i);
    expect(await readEvent()).toEqual(first);
  });

  it("refuses a spin when no wheel is up", async () => {
    const cookie = await signIn();
    const res = await postSpin(cookie);
    expect(res.status).toBe(409);
    expect(apiErrorSchema.parse(await res.json()).error).toMatch(/not up/i);
  });

  it("refuses to start an event at all when the wheel could not spin", async () => {
    const admin = await signIn("tester");
    const listed = await app.request(
      "/api/prizes",
      { headers: { Cookie: admin } },
      env,
    );
    expect(listed.status).toBe(200);
    for (const prize of prizeIdsOf(await listed.json()).slice(
      MIN_ENABLED_PRIZES - 1,
    )) {
      const off = await app.request(
        `/api/prizes/${String(prize)}`,
        {
          method: "PATCH",
          headers: { Cookie: admin, "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        },
        env,
      );
      expect(off.status).toBe(200);
    }

    const refused = await eventAction(admin, "start");
    expect(refused.status).toBe(409);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(/prizes/i);
    expect((await readEvent()).phase).toBe("submission");
  });
});

describe("a Bowser day", () => {
  it("comes back with the beast and the Bowser set, and says so nowhere earlier", async () => {
    const { wheel } = await aBowserWheel();
    expect(wheel.bowser).toBe(true);
    expect(wheel.segments).toEqual(BOWSER_PRIZES);
    expect(wheel.beastEndsAt).not.toBeNull();
  });

  it("leaves an unmarked day exactly as it was", async () => {
    const { wheel } = await aWheel();
    expect(wheel.bowser).toBe(false);
    expect(wheel.beastEndsAt).toBeNull();
    expect(wheel.segments).toEqual([...SEED_PRIZES]);
  });

  it("is still the Bowser day's wheel, on the same moment, after the spin", async () => {
    const { wheel, winnerCookie } = await aBowserWheel();
    await afterTheBeast(wheel, async () => {
      expect((await postSpin(winnerCookie)).status).toBe(200);
    });

    const spun = await readEvent();
    expect(spun.bowser).toBe(true);
    expect(spun.segments).toEqual(BOWSER_PRIZES);
    expect(spun.beastEndsAt).toBe(wheel.beastEndsAt);
    expect(spun.prizeIndex).not.toBeNull();
  });

  it("will not be spun past the beast, by the winner or by the host", async () => {
    const { wheel, hostCookie, winnerCookie } = await aBowserWheel("judge");
    for (const cookie of [winnerCookie, hostCookie]) {
      const refused = await postSpin(cookie);
      expect(refused.status).toBe(409);
      expect(apiErrorSchema.parse(await refused.json()).error).toMatch(
        /beast/i,
      );
    }
    expect((await readEvent()).spunAt).toBeNull();

    await afterTheBeast(wheel, async () => {
      expect((await postSpin(hostCookie)).status).toBe(200);
    });
    expect((await readEvent()).spunAt).not.toBeNull();
  });

  it("awards a Bowser prize and turns the day over", async () => {
    const { wheel, winnerCookie } = await aBowserWheel();
    await afterTheBeast(wheel, async () => {
      expect((await postSpin(winnerCookie)).status).toBe(200);
    });
    expect(await runEventAlarm()).toBe(true);

    const award = await storedAward(1);
    expect(BOWSER_PRIZES).toContain(award?.prize_label);
    expect(award?.user_id).toBe(wheel.winnerUserId);
    expect(await currentDay()).toBe(2);
  });

  it("refuses to start when its OWN list is short, and names which one is", async () => {
    const admin = await signIn("tester");
    expect((await markBowserDay(admin, 1)).status).toBe(200);

    const refused = await eventAction(admin, "start");
    expect(refused.status).toBe(409);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(
      /Bowser wheel/,
    );
    expect((await readEvent()).phase).toBe("submission");
  });

  it("is the day's own affair: unmarking it puts the ordinary wheel back", async () => {
    const admin = await signIn("tester");
    expect((await markBowserDay(admin, 1)).status).toBe(200);
    const unmarked = await app.request(
      "/api/admin/bowser/1",
      { method: "DELETE", headers: { Cookie: admin } },
      env,
    );
    expect(unmarked.status).toBe(200);

    const { wheel } = await aWheel();
    expect(wheel.bowser).toBe(false);
    expect(wheel.segments).toEqual([...SEED_PRIZES]);
  });
});

describe("a rigged landing", () => {
  it("lands on the prize the operator picked, day after day", async () => {
    const admin = await signIn("tester");
    for (const label of ["A fifth", "A sixth", "A seventh", "An eighth"]) {
      expect((await addPrize(admin, label, "ordinary")).status).toBe(201);
    }
    const prizes = await prizeList(admin);
    // A long wheel and three days on purpose: on the four seeded segments alone a build
    // that ignored the rig lands on all three by luck once in sixty-four runs, and eight
    // segments push that to once in five hundred.
    const picked = [prizes[7], prizes[2], prizes[5]].filter(
      (prize) => prize !== undefined,
    );
    expect(picked).toHaveLength(3);
    for (const [index, prize] of picked.entries()) {
      expect((await rigDay(admin, index + 1, prize.id)).status).toBe(200);
    }

    for (const [index, prize] of picked.entries()) {
      const { winnerCookie } = await aWheel();
      expect((await postSpin(winnerCookie)).status).toBe(200);
      expect(landedOn(await readEvent())).toBe(prize.label);
      expect(await runEventAlarm()).toBe(true);
      expect((await storedAward(index + 1))?.prize_label).toBe(prize.label);
    }
    expect(await currentDay()).toBe(4);
  });

  it("follows a rename and a reorder, because it names a row and not a place", async () => {
    const admin = await signIn("tester");
    const prizes = await prizeList(admin);
    const target = prizes[0];
    if (target === undefined) throw new Error("the seeded wheel is empty");
    expect((await rigDay(admin, 1, target.id)).status).toBe(200);

    const renamed = "Bier wordt alsnog voor je gehaald";
    await patchPrize(admin, target.id, { label: renamed });
    await patchPrize(admin, target.id, { sortOrder: prizes.length });

    const { winnerCookie, wheel } = await aWheel();
    expect(wheel.segments[wheel.segments.length - 1]).toBe(renamed);
    expect((await postSpin(winnerCookie)).status).toBe(200);

    const spun = await readEvent();
    expect(spun.prizeIndex).toBe(spun.segments.length - 1);
    expect(landedOn(spun)).toBe(renamed);
  });

  it("rolls when the rigged prize has been turned off", async () => {
    const admin = await signIn("tester");
    const prizes = await prizeList(admin);
    const target = prizes[0];
    if (target === undefined) throw new Error("the seeded wheel is empty");
    expect((await rigDay(admin, 1, target.id)).status).toBe(200);
    await patchPrize(admin, target.id, { enabled: false });

    const { winnerCookie, wheel } = await aWheel();
    expect(wheel.segments).not.toContain(target.label);
    expect((await postSpin(winnerCookie)).status).toBe(200);
    expect(wheel.segments).toContain(landedOn(await readEvent()));
  });

  it("rolls the Bowser wheel on a day marked after it was rigged", async () => {
    const admin = await signIn("tester");
    const target = (await prizeList(admin))[0];
    if (target === undefined) throw new Error("the seeded wheel is empty");
    expect((await rigDay(admin, 1, target.id)).status).toBe(200);

    const { wheel, winnerCookie } = await aBowserWheel();
    expect(wheel.segments).toEqual(BOWSER_PRIZES);
    await afterTheBeast(wheel, async () => {
      expect((await postSpin(winnerCookie)).status).toBe(200);
    });
    expect(BOWSER_PRIZES).toContain(landedOn(await readEvent()));
  });

  it("rolls the ordinary wheel when the rig names the other set's prize", async () => {
    const admin = await signIn("tester");
    for (const label of BOWSER_PRIZES) {
      expect((await addPrize(admin, label, "bowser")).status).toBe(201);
    }
    const beastly = (await prizeList(admin, "bowser"))[0];
    if (beastly === undefined) throw new Error("the Bowser list is empty");
    expect((await rigDay(admin, 1, beastly.id)).status).toBe(200);

    const { winnerCookie, wheel } = await aWheel();
    expect(wheel.segments).toEqual([...SEED_PRIZES]);
    expect((await postSpin(winnerCookie)).status).toBe(200);
    expect(SEED_PRIZES).toContain(landedOn(await readEvent()));
  });

  it("replays on a day the operator wound the clock back over", async () => {
    const admin = await signIn("tester");
    const target = (await prizeList(admin))[1];
    if (target === undefined) throw new Error("the seeded wheel is short");
    expect((await rigDay(admin, 1, target.id)).status).toBe(200);

    const { winnerCookie } = await aWheel();
    expect((await postSpin(winnerCookie)).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);
    expect((await storedAward(1))?.prize_label).toBe(target.label);
    expect(await currentDay()).toBe(2);

    const wound = await app.request(
      "/api/admin/day",
      {
        method: "POST",
        headers: { Cookie: admin, "Content-Type": "application/json" },
        body: JSON.stringify({ day: 1 }),
      },
      env,
    );
    expect(wound.status).toBe(200);
    expect(await storedAward(1)).toBeNull();

    expect((await eventAction(admin, "start")).status).toBe(200);
    await playUntil("wheel");
    expect((await postSpin(winnerCookie)).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);
    expect((await storedAward(1))?.prize_label).toBe(target.label);
  });

  it("says nothing to anybody: no frame, and nothing on the event", async () => {
    const admin = await signIn("tester");
    const target = (await prizeList(admin))[0];
    if (target === undefined) throw new Error("the seeded wheel is empty");

    const watching = await openSocket();
    expect((await rigDay(admin, 1, target.id)).status).toBe(200);
    const cleared = await app.request(
      "/api/admin/rig/1",
      { method: "DELETE", headers: { Cookie: admin } },
      env,
    );
    expect(cleared.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(watching.seen()).toEqual([]);

    expect((await rigDay(admin, 1, target.id)).status).toBe(200);
    await aWheel();
    const res = await app.request("/api/event", {}, env);
    expect(res.status).toBe(200);
    const raw = z.record(z.string(), z.unknown()).parse(await res.json());
    expect(Object.keys(raw).sort()).toEqual(
      [...Object.keys(IDLE_EVENT), "day"].sort(),
    );
  });
});

describe("the landing", () => {
  it("records the award, turns the day over, and hands the world back", async () => {
    const { winnerCookie, wheel } = await aWheel();
    expect((await postSpin(winnerCookie)).status).toBe(200);
    const spun = await readEvent();
    const index = spun.prizeIndex ?? 0;

    expect(await runEventAlarm()).toBe(true);

    const award = await storedAward(1);
    expect(award).toEqual({
      day: 1,
      user_id: wheel.winnerUserId,
      prize_label: spun.segments[index],
    });

    expect(await currentDay()).toBe(2);
    expect(await readEvent()).toEqual({ ...IDLE_EVENT, day: 2 });
    const state = await app.request("/api/state", {}, env);
    expect(gameStateSchema.parse(await state.json())).toEqual({
      day: 2,
      phase: "submission",
      submissionCount: 0,
    });
  });

  it("advances the day exactly once, however often the alarm fires", async () => {
    const { winnerCookie } = await aWheel();
    expect((await postSpin(winnerCookie)).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);
    expect(await currentDay()).toBe(2);

    // The phase is read back from storage rather than trusted from the alarm, so a
    // second firing finds normal play and does nothing at all.
    expect(await runEventAlarm()).toBe(false);
    expect(await currentDay()).toBe(2);
  });

  it("wraps past day 14 without freezing, onto the first jury again", async () => {
    await setDay(14);
    const { winnerCookie } = await aWheel();
    expect((await postSpin(winnerCookie)).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);

    expect(await currentDay()).toBe(15);
    expect((await storedAward(14))?.day).toBe(14);
    expect((await readEvent()).phase).toBe("submission");
  });

  it("leaves the day alone when the operator aborts instead", async () => {
    const { wheel } = await aWheel();
    expect(wheel.day).toBe(1);
    const admin = await signIn("tester");
    expect((await eventAction(admin, "abort")).status).toBe(200);

    expect(await currentDay()).toBe(1);
    expect(await storedAward(1)).toBeNull();
    expect(await runEventAlarm()).toBe(false);
  });
});
