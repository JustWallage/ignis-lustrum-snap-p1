import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { dayResultsSchema, photoSchema } from "../../shared/api";
import { app } from "../index";
import {
  eventAction,
  getJson,
  IDLE_EVENT,
  openSocket,
  putVotes,
  readEvent,
  resetWorld,
  runEventAlarm,
  signIn,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

async function aDayWithTwoSnaps() {
  const mine = await signIn("tester");
  const theirs = await signIn("rival");
  const myPhoto = await uploadPhotoId(mine);
  const theirPhoto = await uploadPhotoId(theirs);
  expect((await putVotes(mine, [theirPhoto])).status).toBe(200);
  expect((await putVotes(theirs, [myPhoto])).status).toBe(200);
  return { mine, theirs, myPhoto, theirPhoto };
}

describe("the reveal", () => {
  it("opens on the countdown running out, and freezes the day's winner", async () => {
    const { mine, myPhoto, theirPhoto } = await aDayWithTwoSnaps();
    expect((await eventAction(mine, "start")).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);

    const event = await readEvent();
    expect(event.phase).toBe("reveal");
    expect(event.revealStartedAt).not.toBeNull();
    expect(event.revealPhotoIds).toHaveLength(2);
    expect(event.revealPhotoIds.at(-1)).toBe(event.winnerPhotoId);
    expect([myPhoto, theirPhoto]).toContain(event.winnerPhotoId);
    expect(event.winnerUserId).not.toBeNull();
  });

  it("agrees with the scoreboard about who won", async () => {
    const { mine } = await aDayWithTwoSnaps();
    expect((await eventAction(mine, "start")).status).toBe(200);
    await runEventAlarm();

    const event = await readEvent();
    const results = dayResultsSchema.parse(
      await getJson("/api/days/1/results", mine),
    );
    expect(results.results[0]?.photoId).toBe(event.winnerPhotoId);
    expect(results.results[0]?.uploader.id).toBe(event.winnerUserId);
  });

  it("does not rename the winner when a vote lands afterwards", async () => {
    const { mine, theirs, myPhoto, theirPhoto } = await aDayWithTwoSnaps();
    expect((await eventAction(mine, "start")).status).toBe(200);
    await runEventAlarm();
    const frozen = await readEvent();

    const loser = frozen.winnerPhotoId === myPhoto ? theirPhoto : myPhoto;
    const late = await putVotes(theirs, [loser]);
    expect(late.status).toBe(409);
    expect((await readEvent()).winnerPhotoId).toBe(frozen.winnerPhotoId);
  });

  it("unmasks the day's uploaders, having masked them a moment earlier", async () => {
    const { mine, theirPhoto } = await aDayWithTwoSnaps();
    const masked = photoSchema.parse(
      await getJson(`/api/photos/${String(theirPhoto)}`, mine),
    );
    expect(masked.uploader).toBeNull();
    const early = await app.request(
      "/api/days/1/results",
      { headers: { Cookie: mine } },
      env,
    );
    expect(early.status).toBe(403);

    expect((await eventAction(mine, "start")).status).toBe(200);
    await runEventAlarm();

    const shown = photoSchema.parse(
      await getJson(`/api/photos/${String(theirPhoto)}`, mine),
    );
    expect(shown.uploader?.name).toBe("rival");
  });

  it("pushes the reveal to everyone rather than making them ask", async () => {
    const { mine } = await aDayWithTwoSnaps();
    expect((await eventAction(mine, "start")).status).toBe(200);
    await runEventAlarm();

    const socket = await openSocket();
    expect(socket.greeting).toContainEqual(
      expect.objectContaining({ type: "event_changed" }),
    );
  });

  it("ends the event on an empty day instead of spinning for nobody", async () => {
    const cookie = await signIn();
    expect((await eventAction(cookie, "start")).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);

    const reveal = await readEvent();
    expect(reveal.phase).toBe("reveal");
    expect(reveal.revealPhotoIds).toEqual([]);
    expect(reveal.winnerUserId).toBeNull();
    expect(reveal.podiumRank).toBeNull();

    expect(await runEventAlarm()).toBe(true);
    expect(await readEvent()).toEqual({ ...IDLE_EVENT, day: 1 });
  });

  it("hands the parade over to a podium rather than straight to the wheel", async () => {
    const { mine } = await aDayWithTwoSnaps();
    expect((await eventAction(mine, "start")).status).toBe(200);
    expect(await runEventAlarm()).toBe(true);
    const parading = await readEvent();
    expect(parading.podiumRank).toBeNull();
    expect(await runEventAlarm()).toBe(true);

    const podium = await readEvent();
    expect(podium.phase).toBe("reveal");
    expect(podium.podiumRank).toBe(2);
    expect(podium.podiumNextAt).toBeNull();
    expect(podium.winnerPhotoId).toBe(parading.winnerPhotoId);
    expect(podium.revealPhotoIds).toEqual(parading.revealPhotoIds);
  });
});
