import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { apiErrorSchema, clockSchema } from "../../shared/api";
import { app } from "../index";
import {
  aWheel,
  currentDay,
  eventAction,
  openSocket,
  playUntil,
  postSpin,
  readEvent,
  resetWorld,
  runEventAlarm,
  signIn,
  storedAward,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

async function setClock(cookie: string, body: unknown): Promise<Response> {
  return app.request(
    "/api/admin/day",
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

async function movedTo(cookie: string, day: number) {
  const res = await setClock(cookie, { day });
  expect(res.status).toBe(200);
  return clockSchema.parse(await res.json());
}

describe("POST /api/admin/day", () => {
  it("winds forwards and backwards, and answers with the clock rather than an ok", async () => {
    const admin = await signIn();
    await uploadPhotoId(admin);

    const forwards = await movedTo(admin, 7);
    expect(forwards.day).toBe(7);
    expect(forwards.phase).toBe("submission");
    // Day 7 has nothing in it — the count is the TARGET day's, not the one left behind.
    expect(forwards.submissionCount).toBe(0);
    expect(forwards.awardsDropped).toBe(0);
    expect(await currentDay()).toBe(7);

    const backwards = await movedTo(admin, 1);
    expect(backwards.day).toBe(1);
    expect(backwards.submissionCount).toBe(1);
    expect(await currentDay()).toBe(1);
  });

  // Fourteen screens are already open when the operator moves the clock, and none of
  // them reloads. The phase rides along untouched: this route never writes the column.
  it("pushes the new day at every socket already listening", async () => {
    const admin = await signIn();
    const socket = await openSocket(admin);

    await movedTo(admin, 4);

    expect(await socket.next()).toEqual({
      type: "state_changed",
      state: { day: 4, phase: "submission", submissionCount: 0 },
    });
  });

  // The regression the award cleanup exists for: `prize_awards_day_idx` is unique, so a
  // leftover row makes the replayed landing roll its whole batch back and the day then
  // silently refuses to turn over.
  it("drops the awards it is rewinding past, so the replayed landing can award again", async () => {
    const { winnerCookie } = await aWheel();
    expect((await postSpin(winnerCookie)).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);
    expect(await storedAward(1)).not.toBeNull();
    expect(await currentDay()).toBe(2);

    const admin = await signIn();
    const rewound = await movedTo(admin, 1);
    expect(rewound.awardsDropped).toBe(1);
    expect(await storedAward(1)).toBeNull();
    expect(await currentDay()).toBe(1);

    expect((await eventAction(admin, "start")).status).toBe(200);
    await playUntil("wheel");
    expect((await postSpin(winnerCookie)).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);
    expect(await storedAward(1)).not.toBeNull();
    expect(await currentDay()).toBe(2);
  });

  it("refuses while an event is live, and the event is untouched", async () => {
    const admin = await signIn();
    await uploadPhotoId(admin);
    expect((await eventAction(admin, "start")).status).toBe(200);
    const before = await readEvent();

    const refused = await setClock(admin, { day: 9 });
    expect(refused.status).toBe(409);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(/event/i);
    expect(await currentDay()).toBe(1);
    expect(await readEvent()).toEqual(before);
  });

  it("takes a whole positive day and nothing else", async () => {
    const admin = await signIn();
    for (const body of [
      {},
      { day: 0 },
      { day: -1 },
      { day: 1.5 },
      { day: "2" },
    ]) {
      const refused = await setClock(admin, body);
      expect(refused.status, JSON.stringify(body)).toBe(400);
      expect(apiErrorSchema.parse(await refused.json()).error).not.toBe("");
    }
    expect(await currentDay()).toBe(1);
  });

  it("is admin-only, and needs a session before that", async () => {
    const friend = await signIn("rival");
    expect((await setClock(friend, { day: 3 })).status).toBe(403);
    expect((await setClock("", { day: 3 })).status).toBe(401);
    expect(await currentDay()).toBe(1);
  });
});
