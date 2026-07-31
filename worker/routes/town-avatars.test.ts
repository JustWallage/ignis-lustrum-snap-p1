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

describe("GET /api/avatars", () => {
  it("lists whoever has been drawn, by their sprite key, and nobody else", async () => {
    const mine = await signIn();
    const theirs = await signIn("rival");
    await drawFor(theirs);

    const first = await readTown(mine);
    expect(first.avatars.map((one) => one.user.name)).toEqual(["rival"]);
    expect(first.avatars[0]?.url).toMatch(SPRITE_URL);

    await drawFor(mine);
    expect((await readTown(mine)).avatars.map((one) => one.user.name)).toEqual([
      "rival",
      "tester",
    ]);
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

  it("drops a player who takes their avatar off", async () => {
    const cookie = await signIn();
    await drawFor(cookie);
    expect((await readTown(cookie)).avatars).toHaveLength(1);

    const removed = await app.request(
      "/api/avatar",
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(removed.status).toBe(200);
    expect((await readTown(cookie)).avatars).toEqual([]);
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
