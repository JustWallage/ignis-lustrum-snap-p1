import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { apiErrorSchema } from "../../shared/api";
import { MIN_ENABLED_PRIZES, SEED_PRIZES } from "../../shared/prizes";
import { gameStateSchema } from "../../shared/state";
import { app } from "../index";
import {
  aWheel,
  currentDay,
  eventAction,
  fireEventAlarm,
  IDLE_EVENT,
  openSocket,
  postSpin,
  readEvent,
  resetWorld,
  runEventAlarm,
  setDay,
  signIn,
  storedAward,
} from "../test-helpers";

beforeEach(resetWorld);

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

  it("lets only the day's winner spin, whatever anyone else's client thinks", async () => {
    const { loserCookie } = await aWheel();
    const refused = await postSpin(loserCookie);
    expect(refused.status).toBe(403);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(/winner/i);
    expect((await readEvent()).spunAt).toBeNull();
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
