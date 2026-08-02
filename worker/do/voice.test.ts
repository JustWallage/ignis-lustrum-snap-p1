import { beforeEach, describe, expect, it } from "vitest";
import { TALK_FRAME_MAX_BYTES } from "../../shared/presence";
import {
  nothingLike,
  openSocket,
  resetWorld,
  signIn,
  type TestSocket,
} from "../test-helpers";

beforeEach(resetWorld);

const CHUNK = new Uint8Array(320).fill(7).buffer;

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

async function held(speaker: TestSocket): Promise<void> {
  speaker.talk(true);
  await settle();
}

describe("voice", () => {
  it("relays a held transmission to another signed-in friend, and stops on release", async () => {
    const speaker = await openSocket(await signIn("tester"));
    const listener = await openSocket(await signIn("rival"));

    await held(speaker);
    expect(await listener.next()).toMatchObject({
      type: "presence_talk_start",
      name: "tester",
    });

    speaker.sendAudio(CHUNK);
    speaker.sendAudio(CHUNK);
    await settle();
    expect(listener.heardAudio()).toBe(2);

    speaker.talk(false);
    expect(await listener.next()).toMatchObject({ type: "presence_talk_end" });
    speaker.sendAudio(CHUNK);
    await settle();
    expect(listener.heardAudio()).toBe(2);
  });

  it("lets an anonymous socket neither transmit nor receive", async () => {
    const speaker = await openSocket(await signIn("tester"));
    const listener = await openSocket(await signIn("rival"));
    const visitor = await openSocket();

    await held(speaker);
    speaker.sendAudio(CHUNK);
    await settle();
    expect(visitor.heardAudio()).toBe(0);
    expect(visitor.seen()).not.toContain("presence_talk_start");

    visitor.talk(true);
    visitor.sendAudio(CHUNK);
    await settle();
    expect(listener.heardAudio()).toBe(1);
    await nothingLike(listener, "presence_talk_end");
  });

  it("spares the speaker their own audio and their own talk frames", async () => {
    const speaker = await openSocket(await signIn("tester"));
    await openSocket(await signIn("rival"));

    await held(speaker);
    speaker.sendAudio(CHUNK);
    speaker.talk(false);
    await settle();

    expect(speaker.heardAudio()).toBe(0);
    expect(speaker.seen()).not.toContain("presence_talk_start");
    expect(speaker.seen()).not.toContain("presence_talk_end");
  });

  it("refuses a second speaker while the channel is held", async () => {
    const first = await openSocket(await signIn("tester"));
    const second = await openSocket(await signIn("rival"));
    const listener = await openSocket(await signIn("voter"));

    await held(first);
    expect(await listener.next()).toMatchObject({
      type: "presence_talk_start",
      name: "tester",
    });

    second.talk(true);
    second.sendAudio(CHUNK);
    await settle();
    expect(listener.seen()).not.toContain("presence_talk_start");
    expect(listener.heardAudio()).toBe(0);
    expect(first.heardAudio()).toBe(0);
  });

  it("drops an oversize frame without disturbing the socket", async () => {
    const speaker = await openSocket(await signIn("tester"));
    const listener = await openSocket(await signIn("rival"));

    await held(speaker);
    expect(await listener.next()).toMatchObject({
      type: "presence_talk_start",
    });

    speaker.sendAudio(new Uint8Array(TALK_FRAME_MAX_BYTES + 1).buffer);
    await settle();
    expect(listener.heardAudio()).toBe(0);

    speaker.sendAudio(CHUNK);
    await settle();
    expect(listener.heardAudio()).toBe(1);
  });

  it("drops a chunk from a socket that never pressed anything", async () => {
    const speaker = await openSocket(await signIn("tester"));
    const listener = await openSocket(await signIn("rival"));

    speaker.sendAudio(CHUNK);
    await settle();
    expect(listener.heardAudio()).toBe(0);
    expect(listener.seen()).not.toContain("presence_talk_start");
  });

  it("tells a friend joining mid-transmission, before the roster", async () => {
    const speaker = await openSocket(await signIn("tester"));
    await held(speaker);

    const latecomer = await openSocket(await signIn("rival"));
    expect(latecomer.greeting.map((event) => event.type)).toEqual([
      "state_changed",
      "event_changed",
      "presence_talk_start",
      "presence_here",
    ]);
    expect(latecomer.greeting.at(-1)).toMatchObject({ type: "presence_here" });

    const visitor = await openSocket();
    expect(visitor.greeting.map((event) => event.type)).not.toContain(
      "presence_talk_start",
    );
  });

  it("frees the channel when the speaker's tab dies mid-sentence", async () => {
    const first = await openSocket(await signIn("tester"));
    const listener = await openSocket(await signIn("rival"));

    await held(first);
    expect(await listener.next()).toMatchObject({
      type: "presence_talk_start",
      name: "tester",
    });

    first.close();
    expect(await listener.next()).toMatchObject({ type: "presence_talk_end" });

    const second = await openSocket(await signIn("voter"));
    second.talk(true);
    expect(await listener.next()).toMatchObject({
      type: "presence_talk_start",
      name: "voter",
    });
  });

  it("stores nothing a reload could replay", async () => {
    const speaker = await openSocket(await signIn("tester"));
    await held(speaker);
    speaker.sendAudio(CHUNK);
    speaker.talk(false);
    await settle();

    const latecomer = await openSocket(await signIn("rival"));
    expect(latecomer.greeting.map((event) => event.type)).toEqual([
      "state_changed",
      "event_changed",
      "presence_here",
    ]);
    expect(latecomer.heardAudio()).toBe(0);
  });
});
