import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { bucketSchema } from "../../shared/api";
import { app } from "../index";
import {
  getJson,
  PHOTO_BYTES,
  resetWorld,
  signIn,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

const SPRITE_BYTES = new Uint8Array([9, 8, 7, 6, 5, 4]);

const ORPHAN_KEY = "snaps/orphaned-by-a-crash";

async function snapKeyOf(id: number): Promise<string> {
  const row = await env.DB.prepare("SELECT r2_key FROM photos WHERE id = ?")
    .bind(id)
    .first();
  return z.object({ r2_key: z.string() }).parse(row).r2_key;
}

async function wearASprite(cookie: string): Promise<void> {
  const form = new FormData();
  form.append(
    "sprite",
    new File([SPRITE_BYTES], "s.png", { type: "image/png" }),
  );
  const res = await app.request(
    "/api/test/avatar",
    { method: "POST", body: form, headers: { Cookie: cookie } },
    env,
  );
  expect(res.ok).toBe(true);
}

async function retire(cookie: string, id: number): Promise<void> {
  const res = await app.request(
    `/api/admin/photos/${String(id)}/retire`,
    { method: "POST", headers: { Cookie: cookie } },
    env,
  );
  expect(res.status).toBe(200);
}

async function readBucket(cookie: string) {
  return bucketSchema.parse(await getJson("/api/admin/images", cookie));
}

describe("GET /api/admin/images", () => {
  it("sorts every key three ways, and only the retired one carries a photograph", async () => {
    const admin = await signIn();
    const friend = await signIn("rival");
    const live = await uploadPhotoId(admin);
    const doomed = await uploadPhotoId(friend);
    await wearASprite(admin);
    const liveKey = await snapKeyOf(live);
    const retiredKey = await snapKeyOf(doomed);
    await retire(admin, doomed);
    // Exactly the leak the object-before-row ordering makes expected: bytes written,
    // then the insert never landed.
    await env.IMAGES.put(ORPHAN_KEY, PHOTO_BYTES);

    const bucket = await readBucket(admin);

    // The live snap and the sprite.
    expect(bucket.live.count).toBe(2);
    expect(bucket.live.bytes).toBeGreaterThan(0);

    expect(bucket.retired.count).toBe(1);
    const [only] = bucket.retired.objects;
    expect(only).toBeDefined();
    expect({ ...only, uploader: only?.uploader.name }).toEqual({
      key: retiredKey,
      size: PHOTO_BYTES.length,
      photoId: doomed,
      day: 1,
      uploader: "rival",
      url: `/api/admin/images/${retiredKey}`,
    });

    expect(bucket.orphaned.objects).toEqual([
      { key: ORPHAN_KEY, size: PHOTO_BYTES.length },
    ]);
    expect(bucket.orphaned.bytes).toBe(PHOTO_BYTES.length);
    // A live snap's key and a sprite's key are never junk, however long they sit
    // there: `avatar_sprites` is the history, so a face nobody wears is still named.
    const orphanKeys = bucket.orphaned.objects.map((one) => one.key);
    expect(orphanKeys).not.toContain(liveKey);
    expect(orphanKeys.some((key) => key.startsWith("sprites/"))).toBe(false);
  });

  it("is admin-only, and needs a session before that", async () => {
    const friend = await signIn("rival");
    const refused = await app.request(
      "/api/admin/images",
      { headers: { Cookie: friend } },
      env,
    );
    expect(refused.status).toBe(403);
    expect((await app.request("/api/admin/images", {}, env)).status).toBe(401);
  });
});

describe("GET /api/admin/images/*", () => {
  it("serves a retired snap's bytes by key, with the content type its row remembers", async () => {
    const admin = await signIn();
    const doomed = await uploadPhotoId(admin);
    const key = await snapKeyOf(doomed);
    await retire(admin, doomed);

    const res = await app.request(
      `/api/admin/images/${key}`,
      { headers: { Cookie: admin } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PHOTO_BYTES);
  });

  it("refuses a live key, an orphan and a key naming nothing — 404, never a 500", async () => {
    const admin = await signIn();
    const live = await uploadPhotoId(admin);
    await wearASprite(admin);
    await env.IMAGES.put(ORPHAN_KEY, PHOTO_BYTES);

    for (const key of [await snapKeyOf(live), ORPHAN_KEY, "snaps/nothing"]) {
      const res = await app.request(
        `/api/admin/images/${key}`,
        { headers: { Cookie: admin } },
        env,
      );
      expect(res.status, key).toBe(404);
    }
  });

  it("refuses a key outside this environment's prefix", async () => {
    const admin = await signIn();
    const doomed = await uploadPhotoId(admin);
    const key = await snapKeyOf(doomed);
    await retire(admin, doomed);

    // Every environment shares ONE bucket and is isolated by IMAGE_PREFIX, so a
    // console running under one prefix must not reach an object under another.
    const res = await app.request(
      `/api/admin/images/${key}`,
      { headers: { Cookie: admin } },
      { ...env, IMAGE_PREFIX: "another-run/" },
    );
    expect(res.status).toBe(403);
  });

  it("is admin-only, and needs a session before that", async () => {
    const admin = await signIn();
    const doomed = await uploadPhotoId(admin);
    const key = await snapKeyOf(doomed);
    await retire(admin, doomed);
    const friend = await signIn("rival");

    const refused = await app.request(
      `/api/admin/images/${key}`,
      { headers: { Cookie: friend } },
      env,
    );
    expect(refused.status).toBe(403);
    expect(
      (await app.request(`/api/admin/images/${key}`, {}, env)).status,
    ).toBe(401);
  });
});
