import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { townAvatarsSchema } from "../../shared/api";
import type { WsEventType } from "../../shared/ws-events";
import { app } from "../index";
import { bytesToBase64 } from "../lib/bytes";
import {
  openSocket,
  PHOTO_BYTES,
  resetWorld,
  signIn,
  type TestSocket,
} from "../test-helpers";

beforeEach(resetWorld);

const SPRITE_URL = /^\/api\/sprites\/[0-9a-f]{16}$/;

async function drawFor(cookie: string): Promise<void> {
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

async function readTown(cookie: string) {
  const res = await app.request(
    "/api/avatars",
    { headers: { Cookie: cookie } },
    env,
  );
  expect(res.status).toBe(200);
  return townAvatarsSchema.parse(await res.json());
}

/** Steps past the roster frame `refreshSprite` fans out first, and nothing else: this
 * is about the content event behind it, but a THIRD frame would be news. */
async function waitFor(socket: TestSocket, type: WsEventType): Promise<void> {
  let seen: WsEventType = (await socket.next()).type;
  if (seen === "presence_moved") seen = (await socket.next()).type;
  expect(seen).toBe(type);
}

/** By NAME, because the listing is the whole town now and the first group belongs to
 * whoever sorts first, drawn or not. */
async function spritesOf(cookie: string, name: string) {
  const town = await readTown(cookie);
  return town.players.find((one) => one.user.name === name)?.sprites ?? [];
}

describe("GET /api/avatars", () => {
  it("lists the WHOLE town, with the keys of whoever has been drawn", async () => {
    const mine = await signIn();
    const theirs = await signIn("rival");
    await drawFor(theirs);

    const first = await readTown(mine);
    // A crowd is everybody, so a player who has never been drawn is a group with no
    // sprites — not an absence the crowd would have to stand without.
    expect(first.players.map((one) => one.user.name)).toEqual([
      "judge",
      "rival",
      "tester",
      "voter",
    ]);
    const drawn = first.players.filter((one) => one.sprites.length > 0);
    expect(drawn.map((one) => one.user.name)).toEqual(["rival"]);
    expect(drawn[0]?.sprites[0]?.url).toMatch(SPRITE_URL);

    await drawFor(mine);
    expect(
      (await readTown(mine)).players
        .filter((one) => one.sprites.length > 0)
        .map((one) => one.user.name),
    ).toEqual(["rival", "tester"]);
  });

  it("keeps every generation, newest first, and marks the worn one", async () => {
    const cookie = await signIn();
    await drawFor(cookie);
    await drawFor(cookie);

    const sprites = await spritesOf(cookie, "tester");
    expect(sprites).toHaveLength(2);
    // Insert-only, so the higher id is the later drawing and the listing puts it first.
    expect(sprites[0]?.id).toBeGreaterThan(sprites[1]?.id ?? 0);
    expect(sprites.map((one) => one.worn)).toEqual([true, false]);
  });

  it("sends no bytes and not `/api/avatar/image`, which is one player's own", async () => {
    const cookie = await signIn();
    await drawFor(cookie);
    const res = await app.request(
      "/api/avatars",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    // Read as TEXT: a parse would strip an extra field before the assertion saw it,
    // and an extra field is exactly the leak these two lines are the backstop for.
    const raw = await res.text();
    expect(raw).toContain("/api/sprites/");
    expect(raw).not.toContain("avatar/image");
    expect(raw).not.toContain(bytesToBase64(PHOTO_BYTES));
    townAvatarsSchema.parse(JSON.parse(raw));
  });

  it("keeps a player who takes their avatar off, wearing none of it", async () => {
    const cookie = await signIn();
    await drawFor(cookie);
    expect(await spritesOf(cookie, "tester")).toHaveLength(1);

    const removed = await app.request(
      "/api/avatar",
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(removed.status).toBe(200);
    const sprites = await spritesOf(cookie, "tester");
    expect(sprites).toHaveLength(1);
    expect(sprites[0]?.worn).toBe(false);
  });

  it("is behind the cookie: walking is public, a name beside a sprite is not", async () => {
    const anonymous = await app.request("/api/avatars", {}, env);
    expect(anonymous.status).toBe(401);
  });

  it("says a sprite changed to every screen, the one that drew it included", async () => {
    const cookie = await signIn();
    const mine = await openSocket(cookie);
    const watcher = await openSocket();

    await drawFor(cookie);
    // The presence frame skips the socket that generated, so this content event is
    // the only word that player's own open archive gets.
    await waitFor(mine, "avatar_changed");
    await waitFor(watcher, "avatar_changed");
  });
});
