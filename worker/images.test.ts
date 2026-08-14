import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { evaluationRetrySchema } from "../shared/api";
import { app } from "./index";
import { listImages } from "./lib/images";
import {
  geminiReply,
  geminiRequestSchema,
  PHOTO_BASE64,
  PHOTO_BYTES,
  postRetry,
  resetWorld,
  signIn,
  stubGemini,
  uploadPhoto,
  uploadPhotoId,
  VERDICT,
} from "./test-helpers";

beforeEach(resetWorld);

const SPRITE_BYTES = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]);

async function storedKeys(): Promise<string[]> {
  const listed = await env.IMAGES.list();
  return listed.objects.map((object) => object.key).sort();
}

async function snapKeyOf(id: number): Promise<string> {
  const row = await env.DB.prepare("SELECT r2_key FROM photos WHERE id = ?")
    .bind(id)
    .first();
  return z.object({ r2_key: z.string() }).parse(row).r2_key;
}

async function fetchImage(id: number, cookie: string): Promise<Response> {
  return app.request(
    `/api/photos/${String(id)}/image`,
    { headers: { Cookie: cookie } },
    env,
  );
}

async function wearASprite(cookie: string): Promise<string> {
  const form = new FormData();
  form.append(
    "sprite",
    new File([SPRITE_BYTES], "sprite.png", { type: "image/png" }),
  );
  const res = await app.request(
    "/api/test/avatar",
    { method: "POST", body: form, headers: { Cookie: cookie } },
    { ...env, ENVIRONMENT: "local" },
  );
  expect(res.status).toBe(200);
  const row = await env.DB.prepare(
    "SELECT avatar_key FROM users WHERE name = 'tester'",
  ).first();
  return z.object({ avatar_key: z.string() }).parse(row).avatar_key;
}

describe("listImages", () => {
  // The page size is a parameter precisely so the cursor loop can be proved with five
  // objects instead of a thousand in the bucket every e2e run shares.
  it("pages past a full page and hands back everything under the prefix", async () => {
    const keys = ["snaps/a", "snaps/b", "snaps/c", "sprites/d", "sprites/e"];
    for (const key of keys) {
      await env.IMAGES.put(key, PHOTO_BYTES);
    }

    const listed = await listImages(env, 2);
    expect(listed.map((one) => one.key).sort()).toEqual(keys);
    expect(listed.every((one) => one.size === PHOTO_BYTES.length)).toBe(true);
    // Not the first page only, and not the first page twice either.
    expect(new Set(listed.map((one) => one.key)).size).toBe(keys.length);
  });
});

describe("image bytes in the bucket", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves an uploaded snap back byte for byte", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);

    const res = await fetchImage(id, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PHOTO_BYTES);
    expect(await storedKeys()).toEqual([await snapKeyOf(id)]);
  });

  it("leaves neither the row nor the object behind on a delete", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);

    const res = await app.request(
      `/api/photos/${String(id)}`,
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await storedKeys()).toEqual([]);
    expect((await fetchImage(id, cookie)).status).toBe(404);
  });

  it("leaves exactly one row and one object on a replace", async () => {
    const cookie = await signIn();
    const first = await uploadPhotoId(cookie);
    const firstKey = await snapKeyOf(first);

    const replaced = await uploadPhoto(cookie, { replace: true });
    expect(replaced.status).toBe(201);
    const second = z.object({ id: z.int() }).parse(await replaced.json()).id;

    const secondKey = await snapKeyOf(second);
    expect(secondKey).not.toBe(firstKey);
    expect(await storedKeys()).toEqual([secondKey]);
  });

  it("404s a snap whose object has gone, rather than 500ing on it", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    await env.IMAGES.delete(await snapKeyOf(id));

    const res = await fetchImage(id, cookie);
    expect(res.status).toBe(404);
    expect(await snapKeyOf(id)).not.toBe("");
  });

  it("hands the jury the bytes out of the bucket on a retry", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);

    const fetched = stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const res = await postRetry(
      cookie,
      `/api/admin/photos/${String(id)}/evaluate`,
    );
    expect(res.status).toBe(200);
    expect(evaluationRetrySchema.parse(await res.json())).toMatchObject({
      attempted: 1,
      ok: 1,
    });

    const call = fetched.mock.calls[0];
    if (call === undefined) throw new Error("Gemini was never called");
    const body = geminiRequestSchema.parse(
      JSON.parse(z.string().parse(call[1].body)),
    );
    const sent = (body.contents[0]?.parts ?? []).flatMap((part) =>
      part.inlineData === undefined ? [] : [part.inlineData],
    );
    expect(sent).toEqual([{ mimeType: "image/png", data: PHOTO_BASE64 }]);
  });

  it("scores nothing for a row whose object has gone", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    await env.IMAGES.delete(await snapKeyOf(id));

    const fetched = stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const res = await postRetry(
      cookie,
      `/api/admin/photos/${String(id)}/evaluate`,
    );

    expect(res.status).toBe(200);
    expect(evaluationRetrySchema.parse(await res.json())).toMatchObject({
      attempted: 1,
      ok: 0,
      failed: 1,
    });
    expect(fetched).not.toHaveBeenCalled();
  });

  it("keeps the superseded sprite's object beside the new one", async () => {
    const cookie = await signIn();
    const first = await wearASprite(cookie);
    expect(await storedKeys()).toEqual([`sprites/${first}`]);

    const second = await wearASprite(cookie);
    expect(second).not.toBe(first);
    expect((await storedKeys()).sort()).toEqual(
      [`sprites/${first}`, `sprites/${second}`].sort(),
    );
  });

  it("leaves the sprite object behind when a player undresses", async () => {
    const cookie = await signIn();
    const key = await wearASprite(cookie);

    const res = await app.request(
      "/api/avatar",
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await storedKeys()).toEqual([`sprites/${key}`]);
  });

  it("sweeps the bucket when the world is reset", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    await wearASprite(cookie);
    expect(await storedKeys()).toHaveLength(2);

    await resetWorld();
    expect(await storedKeys()).toEqual([]);
  });
});
