import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { PresencePlayer } from "../../shared/presence";
import type { WsEvent } from "../../shared/ws-events";
import { app } from "../index";
import { readSocketState } from "../lib/presence";
import {
  nothingLike,
  openSocket,
  PHOTO_BYTES,
  resetWorld,
  signIn,
  type TestSocket,
} from "../test-helpers";

beforeEach(resetWorld);

const SPRITE_URL = /^\/api\/sprites\/[0-9a-f]{16}$/;

async function storeTestAvatar(cookie: string): Promise<void> {
  const form = new FormData();
  form.append(
    "sprite",
    new File([PHOTO_BYTES], "sprite.png", { type: "image/png" }),
  );
  const res = await app.request(
    "/api/test/avatar",
    { method: "POST", body: form, headers: { Cookie: cookie } },
    { ...env, ENVIRONMENT: "local" },
  );
  expect(res.status).toBe(200);
}

/** Steps past the `avatar_changed` a sprite change also broadcasts, and NOTHING else:
 * skipping any frame would let a stray one through the assertions below. */
async function nextMove(socket: TestSocket): Promise<PresencePlayer> {
  let event: WsEvent = await socket.next();
  while (event.type === "avatar_changed") event = await socket.next();
  if (event.type !== "presence_moved") {
    throw new Error(`expected a presence_moved, got ${event.type}`);
  }
  return event.player;
}

function greetedWith(socket: TestSocket): PresencePlayer[] {
  const last = socket.greeting.at(-1);
  if (last?.type !== "presence_here") {
    throw new Error("the greeting ended without a roster");
  }
  return last.players;
}

describe("presence", () => {
  const AT = { x: 4, y: 4, facing: "down" } as const;

  it("tells everyone else where a player walked, and never tells them", async () => {
    const cookie = await signIn();
    const watcher = await openSocket();
    const walker = await openSocket(cookie);

    walker.announce(AT);
    expect(await watcher.next()).toMatchObject({
      type: "presence_moved",
      player: { name: "tester", ...AT },
    });
    await nothingLike(walker, "presence_moved");
  });

  it("hands a joining client the roster instead of making them wait for a step", async () => {
    const walker = await openSocket(await signIn());
    walker.announce(AT);

    const newcomer = await openSocket();
    expect(newcomer.greeting.at(-1)).toMatchObject({
      type: "presence_here",
      players: [{ name: "tester", ...AT }],
    });
  });

  it("takes a player off every other screen when their tab closes", async () => {
    const watcher = await openSocket();
    const walker = await openSocket(await signIn());
    walker.announce(AT);
    const moved = await watcher.next();
    if (moved.type !== "presence_moved") throw new Error("no move to leave");

    walker.close();
    expect(await watcher.next()).toEqual({
      type: "presence_left",
      id: moved.player.id,
    });
  });

  it("shows an anonymous visitor everyone, and shows them to nobody", async () => {
    const walker = await openSocket(await signIn());
    const spectator = await openSocket();

    walker.announce(AT);
    expect(await spectator.next()).toMatchObject({ type: "presence_moved" });
    spectator.announce({ x: 3, y: 4, facing: "up" });
    await nothingLike(walker, "presence_moved");
  });

  it("refuses to let a socket be a user it is not", async () => {
    const watcher = await openSocket();
    const liar = await openSocket(undefined, "/api/ws?name=tester");
    liar.sendRaw(JSON.stringify({ type: "presence", ...AT, name: "tester" }));
    await nothingLike(watcher, "presence_moved");

    const walker = await openSocket(await signIn(), "/api/ws?name=rival");
    walker.sendRaw(JSON.stringify({ type: "presence", ...AT, name: "rival" }));
    expect(await watcher.next()).toMatchObject({
      type: "presence_moved",
      player: { name: "tester" },
    });
  });

  it("drops a frame that is not a position, without dropping the socket", async () => {
    const watcher = await openSocket();
    const walker = await openSocket(await signIn());

    for (const junk of [
      "not json",
      "{}",
      '{"type":"presence","x":99,"y":0,"facing":"down"}',
    ]) {
      walker.sendRaw(junk);
    }
    await nothingLike(watcher, "presence_moved");

    walker.announce(AT);
    expect(await watcher.next()).toMatchObject({ type: "presence_moved" });
  });

  it("keeps at most one frame per step, so a scripted socket cannot drive the fan-out", async () => {
    const watcher = await openSocket();
    const walker = await openSocket(await signIn());
    walker.announce(AT);
    expect(await watcher.next()).toMatchObject({
      type: "presence_moved",
      player: { x: 4 },
    });

    walker.announce({ x: 5, y: 4, facing: "right" });
    walker.announce({ x: 6, y: 4, facing: "right" });
    await nothingLike(watcher, "presence_moved");

    await new Promise((resolve) => setTimeout(resolve, 200));
    walker.announce({ x: 5, y: 4, facing: "right" });
    expect(await watcher.next()).toMatchObject({
      type: "presence_moved",
      player: { x: 5, facing: "right" },
    });
  });

  it("puts a sprite stored before the socket opened on the roster", async () => {
    const cookie = await signIn();
    await storeTestAvatar(cookie);

    const watcher = await openSocket();
    const walker = await openSocket(cookie);
    walker.announce(AT);
    const moved = await nextMove(watcher);
    expect(moved.name).toBe("tester");
    expect(moved.sprite).toMatch(SPRITE_URL);

    const newcomer = await openSocket();
    expect(greetedWith(newcomer)).toEqual([moved]);
  });

  it("re-dresses a player mid-session, on every screen but their own", async () => {
    const cookie = await signIn();
    const watcher = await openSocket();
    const walker = await openSocket(cookie);
    walker.announce(AT);
    expect((await nextMove(watcher)).sprite).toBeNull();

    await storeTestAvatar(cookie);
    const dressed = await nextMove(watcher);
    expect(dressed).toMatchObject({ name: "tester", ...AT });
    expect(dressed.sprite).toMatch(SPRITE_URL);
    await nothingLike(walker, "presence_moved");

    const removed = await app.request(
      "/api/avatar",
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(removed.status).toBe(200);
    expect(await nextMove(watcher)).toEqual({
      ...dressed,
      sprite: null,
    });
  });

  it("says nothing about somebody who has not announced a position", async () => {
    const cookie = await signIn();
    const watcher = await openSocket();
    await openSocket(cookie);

    await storeTestAvatar(cookie);
    await nothingLike(watcher, "presence_moved");
  });

  it("keeps the roster in the sockets' attachments, where hibernation can find it", async () => {
    // The DO is evicted between events, so a roster held in a field on the class
    // would empty itself. Reading it back through the attachments is what proves
    // there is no such field: this is the same source `presence_here` uses.
    const walker = await openSocket(await signIn());
    walker.announce(AT);
    const newcomer = await openSocket();
    expect(newcomer.greeting.at(-1)).toMatchObject({ type: "presence_here" });

    const stub = env.REALTIME_DO.get(env.REALTIME_DO.idFromName("global"));
    const attached = await runInDurableObject(stub, (_instance, state) =>
      state.getWebSockets().map((socket) => readSocketState(socket)),
    );
    const standing = attached.filter((state) => state?.at != null);
    expect(standing).toMatchObject([{ name: "tester", at: AT }]);
    expect(standing[0]?.id).toEqual(expect.stringMatching(/[0-9a-f-]{36}/));
  });
});
