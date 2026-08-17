import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiErrorSchema } from "../../shared/api";
import { jukeboxStateSchema } from "../../shared/jukebox";
import {
  A_RECORD,
  fireEventAlarm,
  eventAction,
  nothingLike,
  openSocket,
  playUntil,
  putRecord,
  resetWorld,
  signIn,
  stopRecord,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

function playingId(event: unknown): string | null {
  return jukeboxStateSchema.parse(event).playing?.trackId ?? null;
}

/** The cooldown is per presser, so a test that needs a second press either waits it out
 * or presses as somebody else. Waiting is what this is for. */
async function afterTheCooldown<T>(body: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 60_000);
  try {
    return await body();
  } finally {
    vi.useRealTimers();
  }
}

describe("the jukebox", () => {
  it("tells every other socket what one friend put on, an anonymous one included", async () => {
    const cookie = await signIn("tester");
    const friend = await openSocket(await signIn("rival"));
    const visitor = await openSocket();

    expect((await putRecord(A_RECORD, cookie)).status).toBe(200);

    for (const socket of [friend, visitor]) {
      const heard = await socket.next();
      if (heard.type !== "presence_jukebox") {
        throw new Error(`heard ${heard.type} instead`);
      }
      expect(heard.jukebox.playing?.trackId).toBe(A_RECORD.trackId);
      // The whole frame, key by key: nothing on the wire says who pressed.
      expect(Object.keys(heard).sort()).toEqual(["jukebox", "type"]);
      expect(Object.keys(heard.jukebox.playing ?? {}).sort()).toEqual([
        "endsAt",
        "startedAt",
        "trackId",
      ]);
    }
  });

  it("puts a socket that connects mid-record where the record already is", async () => {
    const cookie = await signIn("tester");
    const before = Date.now();
    expect((await putRecord(A_RECORD, cookie)).status).toBe(200);

    const latecomer = await openSocket();
    const frames = latecomer.greeting;
    expect(frames.map((event) => event.type)).toEqual([
      "state_changed",
      "event_changed",
      "presence_jukebox",
      "presence_here",
    ]);
    const record = frames.find((event) => event.type === "presence_jukebox");
    if (record?.type !== "presence_jukebox") throw new Error("no record frame");
    const playing = record.jukebox.playing;
    expect(playing?.trackId).toBe(A_RECORD.trackId);
    expect(playing?.startedAt).toBeGreaterThanOrEqual(before);
    expect(playing?.endsAt).toBe(
      (playing?.startedAt ?? 0) + A_RECORD.durationMs,
    );
  });

  it("greets a socket with nothing while the cabinet is silent", async () => {
    const silent = await openSocket();
    expect(silent.greeting.map((event) => event.type)).toEqual([
      "state_changed",
      "event_changed",
      "presence_here",
    ]);
  });

  it("lets the last press win, whoever pressed before", async () => {
    const mine = await signIn("tester");
    const theirs = await signIn("rival");
    const listener = await openSocket();

    expect((await putRecord(A_RECORD, mine)).status).toBe(200);
    await listener.next();
    const swapped = await putRecord(
      { trackId: "Prince - Kiss", durationMs: 60_000 },
      theirs,
    );
    expect(swapped.status).toBe(200);
    expect(playingId(await swapped.json())).toBe("Prince - Kiss");
    // A third friend, who put nothing on, may still take it off: nobody owns it.
    const stopped = await stopRecord(await signIn("voter"));
    expect(stopped.status).toBe(200);
    expect(playingId(await stopped.json())).toBeNull();
  });

  it("broadcasts the silence when a friend stops the record", async () => {
    const listener = await openSocket();
    expect((await putRecord(A_RECORD, await signIn("tester"))).status).toBe(
      200,
    );
    await listener.next();

    expect((await stopRecord(await signIn("rival"))).status).toBe(200);
    expect(await listener.next()).toEqual({
      type: "presence_jukebox",
      jukebox: { playing: null },
    });
  });

  it("refuses a record while an event is live, with a reason", async () => {
    const cookie = await signIn("tester");
    await uploadPhotoId(cookie);
    expect((await eventAction(cookie, "start")).status).toBe(200);

    const refused = await putRecord(A_RECORD, cookie);
    expect(refused.status).toBe(409);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(/event/i);
  });

  it("stops the record when the countdown lands, and broadcasts the silence", async () => {
    const cookie = await signIn("tester");
    await uploadPhotoId(cookie);
    const listener = await openSocket();
    expect((await putRecord(A_RECORD, cookie)).status).toBe(200);
    await listener.next();

    expect((await eventAction(cookie, "start")).status).toBe(200);
    expect(await listener.next()).toEqual({
      type: "presence_jukebox",
      jukebox: { playing: null },
    });

    // And nothing resumes: the wheel's landing publishes silence, not the record back.
    await playUntil("wheel");
    const latecomer = await openSocket();
    expect(latecomer.greeting.map((event) => event.type)).not.toContain(
      "presence_jukebox",
    );
  });

  it("refuses a second press from the same friend inside the cooldown", async () => {
    const cookie = await signIn("tester");
    expect((await putRecord(A_RECORD, cookie)).status).toBe(200);

    const tooSoon = await stopRecord(cookie);
    expect(tooSoon.status).toBe(409);
    expect(apiErrorSchema.parse(await tooSoon.json()).error).toMatch(/settle/i);

    // Somebody ELSE is not on that cooldown: the cabinet has no owner.
    expect((await stopRecord(await signIn("rival"))).status).toBe(200);
    await afterTheCooldown(async () => {
      expect((await putRecord(A_RECORD, cookie)).status).toBe(200);
    });
  });

  it("expires a record that has run out on read, with no alarm ever set for one", async () => {
    const cookie = await signIn("tester");
    expect((await putRecord(A_RECORD, cookie)).status).toBe(200);
    await settle();

    expect(await fireEventAlarm()).toBe(false);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + A_RECORD.durationMs);
    try {
      const latecomer = await openSocket();
      expect(latecomer.greeting.map((event) => event.type)).not.toContain(
        "presence_jukebox",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("says nothing to a socket about a record nobody put on", async () => {
    const listener = await openSocket();
    await nothingLike(listener, "presence_jukebox");
  });
});
