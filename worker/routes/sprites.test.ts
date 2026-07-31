import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { apiErrorSchema } from "../../shared/api";
import { app } from "../index";
import { resetWorld, signIn } from "../test-helpers";

beforeEach(resetWorld);

const SPRITE_BYTES = new Uint8Array([9, 8, 7, 6, 5, 4]);

const LOCAL = { ...env, ENVIRONMENT: "local" };

async function dress(
  name: string,
  bytes = SPRITE_BYTES,
): Promise<{ cookie: string; key: string }> {
  const cookie = await signIn(name);
  const form = new FormData();
  form.append("sprite", new File([bytes], "sprite.png", { type: "image/png" }));
  const res = await app.request(
    "/api/test/avatar",
    { method: "POST", body: form, headers: { Cookie: cookie } },
    LOCAL,
  );
  expect(res.status).toBe(200);
  const key = await storedKey(name);
  if (key === null) throw new Error("the sprite was stored with no key");
  return { cookie, key };
}

async function storedKey(name: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT avatar_key FROM users WHERE name = ?",
  )
    .bind(name)
    .first();
  return z.object({ avatar_key: z.string().nullable() }).parse(row).avatar_key;
}

async function getSprite(key: string, cookie?: string): Promise<Response> {
  return app.request(
    `/api/sprites/${key}`,
    { headers: cookie === undefined ? {} : { Cookie: cookie } },
    env,
  );
}

describe("GET /api/sprites/:key", () => {
  it("is behind the cookie, like every other picture in the app", async () => {
    const { key } = await dress("rival");
    const cookie = await signIn("tester");
    expect((await getSprite(key)).status).toBe(401);
    expect((await getSprite(key, cookie)).status).toBe(200);
  });

  it("serves a friend's bytes to any signed-in friend", async () => {
    const { key } = await dress("rival");
    const res = await getSprite(key, await signIn("tester"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(SPRITE_BYTES);
    expect(res.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(res.headers.get("ETag")).toBe(`"sprite-${key}"`);
  });

  it("mints a fresh 16-hex-char key per sprite, and no id is in the URL", async () => {
    const mine = await dress("tester");
    const theirs = await dress("rival");
    for (const { key } of [mine, theirs]) expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(mine.key).not.toBe(theirs.key);
  });

  it("404s a key nobody holds", async () => {
    const res = await getSprite("deadbeefdeadbeef", await signIn());
    expect(res.status).toBe(404);
    expect(apiErrorSchema.parse(await res.json()).error).toBe("Not found");
  });

  it("retires the previous key when a second sprite is stored", async () => {
    // This is what makes the immutable cache honest: a URL a friend's screen
    // cached outlives nothing, because the key it named has moved on.
    const cookie = await signIn("tester");
    const first = await dress("rival");
    expect((await getSprite(first.key, cookie)).status).toBe(200);

    const redrawn = new Uint8Array([1, 1, 2, 3]);
    const second = await dress("rival", redrawn);
    expect(second.key).not.toBe(first.key);
    expect((await getSprite(first.key, cookie)).status).toBe(404);
    const res = await getSprite(second.key, cookie);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(redrawn);
  });

  it("retires the key when the sprite is discarded", async () => {
    const watcher = await signIn("tester");
    const { cookie, key } = await dress("rival");
    expect((await getSprite(key, watcher)).status).toBe(200);

    const removed = await app.request(
      "/api/avatar",
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(removed.status).toBe(200);
    expect(await storedKey("rival")).toBeNull();
    expect((await getSprite(key, watcher)).status).toBe(404);
  });
});
