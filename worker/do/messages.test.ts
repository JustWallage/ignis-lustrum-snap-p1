import { beforeEach, describe, expect, it } from "vitest";
import { MESSAGE_MAX_CHARS } from "../../shared/presence";
import { nothingLike, openSocket, resetWorld, signIn } from "../test-helpers";

beforeEach(resetWorld);

const AT = { x: 4, y: 4, facing: "down" } as const;

function say(socket: { sendRaw: (message: string) => void }, text: string) {
  socket.sendRaw(JSON.stringify({ type: "say", text }));
}

async function speaker(name = "tester") {
  const socket = await openSocket(await signIn(name));
  socket.announce(AT);
  return socket;
}

describe("saying something out loud", () => {
  it("tells everyone else, under the socket the roster is keyed by", async () => {
    const watcher = await openSocket();
    const walker = await speaker();
    const moved = await watcher.next();
    if (moved.type !== "presence_moved") throw new Error("no move to speak of");

    say(walker, "meet me by the pond");
    expect(await watcher.next()).toEqual({
      type: "presence_said",
      id: moved.player.id,
      text: "meet me by the pond",
    });
    await nothingLike(walker, "presence_said");
  });

  it("refuses a message longer than the cap", async () => {
    const watcher = await openSocket();
    const walker = await speaker();
    await watcher.next();

    say(walker, "A".repeat(MESSAGE_MAX_CHARS + 1));
    await nothingLike(watcher, "presence_said");

    say(walker, "A".repeat(MESSAGE_MAX_CHARS));
    expect(await watcher.next()).toMatchObject({ type: "presence_said" });
  });

  it("drops a flood, at the pace a person types rather than walks", async () => {
    const watcher = await openSocket();
    const walker = await speaker();
    await watcher.next();

    say(walker, "one");
    expect(await watcher.next()).toMatchObject({
      type: "presence_said",
      text: "one",
    });
    say(walker, "two");
    say(walker, "three");
    await nothingLike(watcher, "presence_said");
  });

  it("drops a blank message and a malformed one, keeping the socket", async () => {
    const watcher = await openSocket();
    const walker = await speaker();
    await watcher.next();

    for (const junk of [
      '{"type":"say","text":"   "}',
      '{"type":"say","text":""}',
      '{"type":"say"}',
      '{"type":"say","text":42}',
      '{"type":"presence_said","id":"sock-1","text":"hello"}',
    ]) {
      walker.sendRaw(junk);
    }
    await nothingLike(watcher, "presence_said");

    say(walker, "still here");
    expect(await watcher.next()).toMatchObject({ text: "still here" });
  });

  it("lets nobody speak who is not standing in the town", async () => {
    const walker = await speaker();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const spectator = await openSocket();
    say(spectator, "hello");
    const silent = await openSocket(await signIn("rival"));
    say(silent, "hello");
    await nothingLike(walker, "presence_said");
  });

  it("remembers nothing, so a late join is told nothing", async () => {
    const walker = await speaker();
    say(walker, "you had to be there");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const newcomer = await openSocket();
    expect(newcomer.greeting.map((event) => event.type)).not.toContain(
      "presence_said",
    );
    await nothingLike(newcomer, "presence_said");
  });

  it("does not swallow the step taken right after it", async () => {
    // The message throttle has its own clock: sharing `seenAt` with the move
    // throttle would make talking cost you a step.
    const watcher = await openSocket();
    const walker = await speaker();
    await watcher.next();

    say(walker, "on my way");
    expect(await watcher.next()).toMatchObject({ type: "presence_said" });
    await new Promise((resolve) => setTimeout(resolve, 150));
    walker.announce({ x: 5, y: 4, facing: "right" });
    expect(await watcher.next()).toMatchObject({
      type: "presence_moved",
      player: { x: 5 },
    });
  });
});
