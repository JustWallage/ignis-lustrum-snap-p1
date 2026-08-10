import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { avatarStateSchema, townAvatarsSchema } from "../../shared/api";
import { app } from "../index";
import {
  openSocket,
  PHOTO_BYTES,
  resetWorld,
  signIn,
  type TestSocket,
} from "../test-helpers";

beforeEach(resetWorld);

const LOCAL = { ...env, ENVIRONMENT: "local" };

async function draw(cookie: string, bytes = PHOTO_BYTES): Promise<void> {
  const form = new FormData();
  form.append("sprite", new File([bytes], "sprite.png", { type: "image/png" }));
  const res = await app.request(
    "/api/test/avatar",
    { method: "POST", body: form, headers: { Cookie: cookie } },
    LOCAL,
  );
  expect(res.status).toBe(200);
}

/** What the gallery hands the browser, which is the only handle the wear route takes. */
async function spritesOf(cookie: string, name: string) {
  const res = await app.request(
    "/api/avatars",
    { headers: { Cookie: cookie } },
    env,
  );
  expect(res.status).toBe(200);
  const { players } = townAvatarsSchema.parse(await res.json());
  return players.find((player) => player.user.name === name)?.sprites ?? [];
}

async function wear(cookie: string, id: number): Promise<Response> {
  return app.request(
    "/api/avatar/worn",
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    },
    env,
  );
}

async function readAvatarState(cookie: string) {
  const res = await app.request(
    "/api/avatar",
    { headers: { Cookie: cookie } },
    env,
  );
  expect(res.status).toBe(200);
  return avatarStateSchema.parse(await res.json());
}

async function usedToday(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT coalesce(sum(used), 0) AS n FROM avatar_generations",
  ).first();
  return z.object({ n: z.int() }).parse(row).n;
}

async function wornKey(name: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT avatar_key FROM users WHERE name = ?",
  )
    .bind(name)
    .first();
  return z.object({ avatar_key: z.string().nullable() }).parse(row).avatar_key;
}

/** Steps past the roster frame `pushSprite` fans out first — the same shape the town
 * listing's own spec uses, because wearing broadcasts exactly what drawing does. */
async function waitForAvatarChange(socket: TestSocket): Promise<void> {
  let seen = (await socket.next()).type;
  if (seen === "presence_moved") seen = (await socket.next()).type;
  expect(seen).toBe("avatar_changed");
}

describe("POST /api/avatar/worn", () => {
  it("puts one of your own old sprites back on", async () => {
    const cookie = await signIn();
    await draw(cookie);
    await draw(cookie, new Uint8Array([1, 2, 3, 4]));

    const sprites = await spritesOf(cookie, "tester");
    const older = sprites[1];
    if (older === undefined) throw new Error("only one sprite was kept");
    expect(older.worn).toBe(false);

    const res = await wear(cookie, older.id);
    expect(res.status).toBe(200);
    expect(avatarStateSchema.parse(await res.json()).avatar).not.toBeNull();

    expect((await spritesOf(cookie, "tester")).map((one) => one.worn)).toEqual([
      false,
      true,
    ]);
  });

  it("spends no quota slot and refunds none", async () => {
    const cookie = await signIn();
    await draw(cookie);
    await draw(cookie);
    // A REAL row first: `/api/test/avatar` reserves nothing, so against an empty table
    // both a spend and a refund are no-ops and the counter would sit at 0 either way.
    const spent = await app.request(
      "/api/test/quota",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ used: 3 }),
      },
      LOCAL,
    );
    expect(spent.status).toBe(200);
    expect(await usedToday()).toBe(3);

    const older = (await spritesOf(cookie, "tester"))[1];
    if (older === undefined) throw new Error("only one sprite was kept");
    expect((await wear(cookie, older.id)).status).toBe(200);

    // Neither direction: a switch is free, and it hands nothing back either.
    expect(await usedToday()).toBe(3);
    const state = await readAvatarState(cookie);
    expect(state.remaining).toBe(state.limit - 3);
  });

  it("refuses somebody else's sprite the way it refuses one that does not exist", async () => {
    const mine = await signIn("tester");
    const theirs = await signIn("rival");
    await draw(theirs);
    await draw(mine);
    const before = await wornKey("tester");

    const hers = (await spritesOf(mine, "rival"))[0];
    if (hers === undefined) throw new Error("the rival drew nothing");
    // 404 and not 403: the listing pairs a name with a key, so a distinguishable
    // refusal would turn it into an oracle for which ids exist.
    expect((await wear(mine, hers.id)).status).toBe(404);
    expect((await wear(mine, 99_999)).status).toBe(404);
    expect(await wornKey("tester")).toBe(before);
    expect(await wornKey("rival")).not.toBe(before);
  });

  it("can dress a player who took their avatar off", async () => {
    const cookie = await signIn();
    await draw(cookie);
    const only = (await spritesOf(cookie, "tester"))[0];
    if (only === undefined) throw new Error("nothing was kept");

    expect(
      (
        await app.request(
          "/api/avatar",
          { method: "DELETE", headers: { Cookie: cookie } },
          env,
        )
      ).status,
    ).toBe(200);
    expect(await wornKey("tester")).toBeNull();

    expect((await wear(cookie, only.id)).status).toBe(200);
    expect(await wornKey("tester")).not.toBeNull();
  });

  it("tells every screen, exactly as a fresh drawing does", async () => {
    const cookie = await signIn();
    await draw(cookie);
    await draw(cookie);
    const older = (await spritesOf(cookie, "tester"))[1];
    if (older === undefined) throw new Error("only one sprite was kept");

    const mine = await openSocket(cookie);
    const watcher = await openSocket();
    expect((await wear(cookie, older.id)).status).toBe(200);
    await waitForAvatarChange(mine);
    await waitForAvatarChange(watcher);
  });

  it("needs a session, and a body it can read", async () => {
    const cookie = await signIn();
    await draw(cookie);
    const only = (await spritesOf(cookie, "tester"))[0];
    if (only === undefined) throw new Error("nothing was kept");

    const anonymous = await app.request(
      "/api/avatar/worn",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: only.id }),
      },
      env,
    );
    expect(anonymous.status).toBe(401);

    const nonsense = await app.request(
      "/api/avatar/worn",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ id: "the first one" }),
      },
      env,
    );
    expect(nonsense.status).toBe(400);
  });
});
