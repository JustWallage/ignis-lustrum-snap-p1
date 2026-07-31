import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { apiErrorSchema } from "../../shared/api";
import {
  HOST_IDLE_MS,
  PODIUM_STEP_MS,
  SCOREBOARD_STAGE,
} from "../../shared/events";
import { app } from "../index";
import {
  eventAction,
  fireEventAlarm,
  openSocket,
  playUntil,
  putVotes,
  readEvent,
  resetWorld,
  runEventAlarm,
  signIn,
  stillWatching,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

async function aPodium() {
  const host = await signIn("tester");
  const rival = await signIn("rival");
  const voter = await signIn("voter");
  const first = await uploadPhotoId(host);
  const second = await uploadPhotoId(rival);
  const third = await uploadPhotoId(voter);
  for (const [cookie, ballot] of [
    [host, [second, third]],
    [rival, [first, third]],
    [voter, [first, second]],
  ] as const) {
    expect((await putVotes(cookie, [...ballot])).status).toBe(200);
  }

  expect((await eventAction(host, "start")).status).toBe(200);
  expect(await runEventAlarm()).toBe(true);
  expect(await runEventAlarm()).toBe(true);
  const podium = await readEvent();
  expect(podium.podiumRank).toBe(3);
  return { host, rival, voter, podium };
}

function withTwoAdmins(): object {
  return { ...env, ADMIN_NAMES: "tester,rival" };
}

describe("the podium", () => {
  it("opens on the worst of the three and waits for its host", async () => {
    const { podium } = await aPodium();
    expect(podium.phase).toBe("reveal");
    expect(podium.podiumRank).toBe(3);
    expect(podium.podiumNextAt).toBeNull();
    expect(podium.stageEndsAt).not.toBeNull();
  });

  it("walks 3 to 2 to 1 on the host's word, one rank per press", async () => {
    const { host } = await aPodium();

    for (const rank of [2, 1]) {
      const asked = await eventAction(host, "next");
      expect(asked.status).toBe(200);
      const building = await readEvent();
      expect(building.podiumRank).toBe(rank + 1);
      expect(building.podiumNextAt).not.toBeNull();
      expect(building.podiumNextAt ?? 0).toBeLessThanOrEqual(
        Date.now() + PODIUM_STEP_MS,
      );

      expect(await runEventAlarm()).toBe(true);
      expect((await readEvent()).podiumRank).toBe(rank);
    }
  });

  it("pushes each rank to everyone rather than making them ask", async () => {
    const { host } = await aPodium();
    const watching = await openSocket();

    expect((await eventAction(host, "next")).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);

    const frames = [];
    for (let read = 0; read < 4; read += 1) frames.push(await watching.next());
    expect(frames).toContainEqual({
      type: "event_changed",
      state: await readEvent(),
    });
  });

  it("keeps the other admin's hands off it", async () => {
    const { rival } = await aPodium();
    const refused = await eventAction(rival, "next", withTwoAdmins());
    expect(refused.status).toBe(403);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(/host/i);
    expect((await readEvent()).podiumRank).toBe(3);
  });

  it("keeps a friend without the operator's keys off it too", async () => {
    const { voter } = await aPodium();
    expect((await eventAction(voter, "next")).status).toBe(403);
    const anonymous = await app.request(
      "/api/admin/event/next",
      { method: "POST" },
      env,
    );
    expect(anonymous.status).toBe(401);
    expect((await readEvent()).podiumRank).toBe(3);
  });

  it("refuses a Next when there is no reveal to move on", async () => {
    const host = await signIn("tester");
    const idle = await eventAction(host, "next");
    expect(idle.status).toBe(409);
    expect(apiErrorSchema.parse(await idle.json()).error).toMatch(/no reveal/i);

    expect((await eventAction(host, "start")).status).toBe(200);
    expect((await eventAction(host, "next")).status).toBe(409);
  });

  // #98's first reported bug: rank 1 held for eight seconds and then left for the
  // wheel with no press at all, which is "stages advanced without the host
  // confirming" straight out of the code rather than a race.
  it("holds the winner's card until the host moves it on", async () => {
    const { host } = await aPodium();
    for (const _rank of [2, 1]) {
      expect((await eventAction(host, "next")).status).toBe(200);
      expect(await runEventAlarm()).toBe(true);
    }
    const winner = await readEvent();
    expect(winner.podiumRank).toBe(1);
    expect(winner.podiumNextAt).toBeNull();
    expect((winner.stageEndsAt ?? 0) - Date.now()).toBeGreaterThan(
      HOST_IDLE_MS / 2,
    );
  });

  it("ends the ranks on the day's whole scoreboard, and that on the wheel", async () => {
    const { host } = await aPodium();
    for (const stage of [2, 1, SCOREBOARD_STAGE]) {
      expect((await eventAction(host, "next")).status).toBe(200);
      expect(await runEventAlarm()).toBe(true);
      expect((await readEvent()).podiumRank).toBe(stage);
    }
    const board = await readEvent();
    expect(board.phase).toBe("reveal");
    expect(board.winnerPhotoId).not.toBeNull();

    expect((await eventAction(host, "next")).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);
    expect((await readEvent()).phase).toBe("wheel");

    const after = await eventAction(host, "next");
    expect(after.status).toBe(409);
    expect(apiErrorSchema.parse(await after.json()).error).toMatch(
      /no reveal/i,
    );
  });

  // Two presses landing together must buy one advance, not two: the second reads
  // the build-up the first published and is a conflict rather than a restart.
  it("makes two Next calls racing produce one advance", async () => {
    const { host } = await aPodium();
    const [first, second] = await Promise.all([
      eventAction(host, "next"),
      eventAction(host, "next"),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    expect((await readEvent()).podiumRank).toBe(3);
    expect(await runEventAlarm()).toBe(true);
    expect((await readEvent()).podiumRank).toBe(2);
  });

  it("stands by the first press: a second one is a conflict, not a restart", async () => {
    const { host } = await aPodium();
    expect((await eventAction(host, "next")).status).toBe(200);
    const building = await readEvent();

    const again = await eventAction(host, "next");
    expect(again.status).toBe(409);
    expect(apiErrorSchema.parse(await again.json()).error).toMatch(/already/i);
    expect(await readEvent()).toEqual(building);
  });

  it("moves itself on when the host stops answering", async () => {
    const { podium } = await aPodium();
    expect(await runEventAlarm()).toBe(true);
    const next = await readEvent();
    expect(next.podiumRank).toBe(2);
    expect(next.stageEndsAt).not.toBeNull();
    expect((next.stageEndsAt ?? 0) - (podium.stageEndsAt ?? 0)).toBeGreaterThan(
      HOST_IDLE_MS / 2,
    );
  });

  // #98's second reported bug. `HOST_IDLE_MS` is ninety seconds and a host talking
  // the room through third place goes past it constantly — so the moment is a CHECK
  // now, and a host who is demonstrably at their screen is not overruled by it.
  it("waits on a host who is still there rather than talking over them", async () => {
    const { host } = await aPodium();
    const watching = await openSocket(host);

    const waiting = await readEvent();
    expect(
      await runEventAlarm(async () => {
        await stillWatching(watching);
      }),
    ).toBe(true);
    expect(await readEvent()).toEqual(waiting);
    expect(watching.seen()).not.toContain("event_changed");

    expect(
      await runEventAlarm(async () => {
        await stillWatching(watching);
      }),
    ).toBe(true);
    expect((await readEvent()).podiumRank).toBe(3);

    expect((await eventAction(host, "next")).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);
    expect((await readEvent()).podiumRank).toBe(2);
  });

  it("is not held up by somebody who is watching but is not the host", async () => {
    const { voter } = await aPodium();
    const friend = await openSocket(voter);
    expect(
      await runEventAlarm(async () => {
        await stillWatching(friend);
      }),
    ).toBe(true);
    expect((await readEvent()).podiumRank).toBe(2);
  });

  it("still rescues a dead host from the last two stages", async () => {
    const { host } = await aPodium();
    for (const stage of [2, 1, SCOREBOARD_STAGE]) {
      expect((await eventAction(host, "next")).status).toBe(200);
      expect(await runEventAlarm()).toBe(true);
      expect((await readEvent()).podiumRank).toBe(stage);
    }
    expect(await runEventAlarm()).toBe(true);
    expect((await readEvent()).phase).toBe("wheel");
  });

  it("does not skip a rank when the alarm fires twice", async () => {
    const { host } = await aPodium();
    expect((await eventAction(host, "next")).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);
    const second = await readEvent();
    expect(second.podiumRank).toBe(2);

    // The phase cannot tell one podium stage from the next — they are all
    // `reveal` — so the DO checks the DEADLINE. A duplicate delivery arrives
    // before this stage's own moment and does nothing at all.
    expect(await fireEventAlarm()).toBe(true);
    expect(await readEvent()).toEqual(second);
    expect(await fireEventAlarm()).toBe(true);
    expect((await readEvent()).podiumRank).toBe(2);
  });

  it("is as deep as the day is, and hands the winner over to the wheel", async () => {
    const host = await signIn("tester");
    const rival = await signIn("rival");
    const first = await uploadPhotoId(host);
    const second = await uploadPhotoId(rival);
    expect((await putVotes(host, [second])).status).toBe(200);
    expect((await putVotes(rival, [first])).status).toBe(200);
    expect((await eventAction(host, "start")).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);
    expect(await runEventAlarm()).toBe(true);
    expect((await readEvent()).podiumRank).toBe(2);

    const wheel = await playUntil("wheel");
    expect(wheel.podiumRank).toBeNull();
    expect(wheel.winnerPhotoId).not.toBeNull();
    expect(wheel.hostUserId).not.toBeNull();
  });
});
