import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiErrorSchema, avatarStateSchema } from "../../shared/api";
import { app } from "../index";
import {
  AVATAR_DAILY_LIMIT,
  AVATAR_GLOBAL_DAILY_LIMIT,
} from "../lib/avatar-caps";
import { bytesToBase64 } from "../lib/bytes";
import {
  AVATAR_IMAGE_SIZE,
  AVATAR_INSTRUCTIONS,
  GEMINI_IMAGE_MODEL,
  GEMINI_MODEL,
} from "../lib/gemini";
import {
  geminiDayReply,
  patchAvatarCaps,
  PHOTO_BYTES,
  resetWorld,
  setDay,
  signIn,
  storedScore,
  stubGemini,
  uploadPhotoId,
  withAvatarKeyOnly,
  withGeminiKey,
  withJuryKeyOnly,
  withoutGeminiKey,
} from "../test-helpers";

beforeEach(resetWorld);

const SPRITE_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

function avatarReply(
  data: string = bytesToBase64(SPRITE_BYTES),
  mimeType = "image/png",
): Response {
  return Response.json({
    candidates: [
      {
        content: {
          parts: [
            { text: "Here is your trainer!" },
            { inlineData: { mimeType, data } },
          ],
        },
      },
    ],
  });
}

async function generateAvatar(
  cookie: string,
  bindings: object = withGeminiKey(),
): Promise<Response> {
  const form = new FormData();
  form.append(
    "photo",
    new File([PHOTO_BYTES], "me.png", { type: "image/png" }),
  );
  return app.request(
    "/api/avatar",
    { method: "POST", body: form, headers: { Cookie: cookie } },
    bindings,
  );
}

async function avatarState(cookie: string) {
  const res = await app.request(
    "/api/avatar",
    { headers: { Cookie: cookie } },
    env,
  );
  expect(res.status).toBe(200);
  return avatarStateSchema.parse(await res.json());
}

async function spendQuota(used: number, who = "tester"): Promise<void> {
  const changed = await env.DB.prepare(
    "INSERT INTO avatar_generations (user_id, day, used, updated_at)" +
      " SELECT id, 1, ?, 0 FROM users WHERE name = ?" +
      " ON CONFLICT (user_id, day) DO UPDATE SET used = excluded.used",
  )
    .bind(used, who)
    .run();
  expect(changed.meta.changes).toBe(1);
}

async function townUsed(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT coalesce(sum(used), 0) AS town FROM avatar_generations WHERE day = 1",
  ).first<{ town: number }>();
  return row?.town ?? 0;
}

async function rowCount(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS rows FROM avatar_generations",
  ).first<{ rows: number }>();
  return row?.rows ?? 0;
}

async function storedAvatar(): Promise<Uint8Array | null> {
  const key = await storedAvatarKey();
  if (key === null) return null;
  const object = await env.IMAGES.get(`sprites/${key}`);
  return object === null ? null : new Uint8Array(await object.arrayBuffer());
}

async function storedAvatarKey(): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT avatar_key FROM users WHERE name = 'tester'",
  ).first();
  return z.object({ avatar_key: z.string().nullable() }).parse(row).avatar_key;
}

describe("avatar generation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws a sprite from any photo and stores it on the user row", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();

    expect(await avatarState(cookie)).toEqual({
      avatar: null,
      remaining: AVATAR_DAILY_LIMIT,
      limit: AVATAR_DAILY_LIMIT,
    });

    const res = await generateAvatar(cookie);
    expect(res.status).toBe(201);
    const state = avatarStateSchema.parse(await res.json());
    expect(state.remaining).toBe(AVATAR_DAILY_LIMIT - 1);
    if (state.avatar === null) throw new Error("no sprite came back");
    expect(state.avatar.url).toContain("/api/avatar/image?v=");

    expect(await storedAvatar()).toEqual(SPRITE_BYTES);
    expect(fetched).toHaveBeenCalledTimes(1);
    expect((await avatarState(cookie)).remaining).toBe(AVATAR_DAILY_LIMIT - 1);
  });

  it("asks the image model, in one call, to personify whatever it is given", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();
    expect((await generateAvatar(cookie)).status).toBe(201);

    const call = fetched.mock.calls[0];
    if (call === undefined) throw new Error("Gemini was never called");
    const [url, init] = call;
    expect(url).toContain(`/${GEMINI_IMAGE_MODEL}:generateContent`);
    expect(url).not.toContain(GEMINI_MODEL);

    const body = z
      .object({
        contents: z.array(
          z.object({
            parts: z.array(
              z.object({
                text: z.string().optional(),
                inlineData: z
                  .object({ mimeType: z.string(), data: z.string() })
                  .optional(),
              }),
            ),
          }),
        ),
        generationConfig: z.object({
          responseModalities: z.array(z.string()),
          imageConfig: z.object({ imageSize: z.string() }),
        }),
      })
      .parse(JSON.parse(z.string().parse(init.body)));

    expect(body.generationConfig.responseModalities).toEqual(["TEXT", "IMAGE"]);
    // The output size is the bill: this model charges per picture by resolution
    // and defaults to 1K, so asking for the smallest tier is a third off every
    // sprite for pixels the draw-time key-out would have thrown away anyway.
    expect(body.generationConfig.imageConfig.imageSize).toBe(AVATAR_IMAGE_SIZE);
    const parts = body.contents[0]?.parts ?? [];
    expect(parts.map((part) => part.text ?? "").join("")).toBe(
      AVATAR_INSTRUCTIONS,
    );
    expect(AVATAR_INSTRUCTIONS).toMatch(/never refuse/i);
    expect(AVATAR_INSTRUCTIONS).toMatch(/personify/i);
    expect(AVATAR_INSTRUCTIONS).toMatch(/#FFFFFF/);
    expect(AVATAR_INSTRUCTIONS).toMatch(/waist/i);
    expect(parts.map((part) => part.inlineData)).toContainEqual({
      mimeType: "image/png",
      data: bytesToBase64(PHOTO_BYTES),
    });
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it("refuses the 11th generation of the day", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();

    expect((await generateAvatar(cookie)).status).toBe(201);
    await spendQuota(AVATAR_DAILY_LIMIT);
    expect((await avatarState(cookie)).remaining).toBe(0);

    const refused = await generateAvatar(cookie);
    expect(refused.status).toBe(429);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(
      /all 10 avatars for today/i,
    );
    expect(fetched).toHaveBeenCalledTimes(1);
    expect((await avatarState(cookie)).remaining).toBe(0);
  });

  it("refuses everybody once the town has spent its 50", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();

    await spendQuota(AVATAR_GLOBAL_DAILY_LIMIT - 1, "rival");
    expect((await avatarState(cookie)).remaining).toBe(1);

    expect((await generateAvatar(cookie)).status).toBe(201);
    expect((await avatarState(cookie)).remaining).toBe(0);

    const refused = await generateAvatar(cookie);
    expect(refused.status).toBe(429);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(
      /all 50 avatars the town gets today/i,
    );
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(await townUsed()).toBe(AVATAR_GLOBAL_DAILY_LIMIT);
  });

  it("keeps one quota row per user per day, in the database", async () => {
    stubGemini(() => avatarReply());
    const cookie = await signIn();
    expect((await generateAvatar(cookie)).status).toBe(201);
    // The counter is bumped by an UPSERT rather than read-then-written, and this
    // index is what makes that atomic: two requests racing cannot both spend the
    // last slot.
    await expect(
      env.DB.prepare(
        "INSERT INTO avatar_generations (user_id, day, used, updated_at)" +
          " SELECT user_id, day, used, updated_at FROM avatar_generations",
      ).run(),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("opens a fresh quota on a new contest day", async () => {
    stubGemini(() => avatarReply());
    const cookie = await signIn();
    await spendQuota(AVATAR_DAILY_LIMIT);
    expect((await generateAvatar(cookie)).status).toBe(429);
    try {
      await setDay(2);
      expect((await avatarState(cookie)).remaining).toBe(AVATAR_DAILY_LIMIT);
      expect((await generateAvatar(cookie)).status).toBe(201);
    } finally {
      await setDay(1);
    }
  });

  const BROKEN_DRAWS: [string, () => Promise<Response> | Response, number][] = [
    ["a 500", () => new Response("upstream is down", { status: 500 }), 502],
    [
      "a timeout",
      () =>
        Promise.reject(
          new DOMException("The operation timed out.", "TimeoutError"),
        ),
      502,
    ],
    [
      "a reply with no image in it",
      () =>
        Response.json({
          candidates: [{ content: { parts: [{ text: "no" }] } }],
        }),
      502,
    ],
    ["a sprite too big to keep", () => avatarReply("A".repeat(2_000_000)), 502],
  ];

  it.each(BROKEN_DRAWS)(
    "spends no quota on %s",
    async (_case, reply, status) => {
      stubGemini(reply);
      const cookie = await signIn();

      const res = await generateAvatar(cookie);
      expect(res.status).toBe(status);
      expect(apiErrorSchema.parse(await res.json()).error).not.toBe("");

      expect(await avatarState(cookie)).toEqual({
        avatar: null,
        remaining: AVATAR_DAILY_LIMIT,
        limit: AVATAR_DAILY_LIMIT,
      });
      expect(await storedAvatar()).toBeNull();
    },
  );

  it("treats a missing GEMINI_API_KEY_PAID as offline, not a crash", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();

    const res = await generateAvatar(cookie, withoutGeminiKey());
    expect(res.status).toBe(503);
    expect(apiErrorSchema.parse(await res.json()).error).toMatch(/offline/i);
    expect(fetched).not.toHaveBeenCalled();
    expect((await avatarState(cookie)).remaining).toBe(AVATAR_DAILY_LIMIT);
  });

  // The two keys, one at a time. There is no fallback between them BY DESIGN: either
  // direction spends the wrong key, so each of these proves the other path went dark
  // rather than quietly borrowing.
  it("draws on the billed key alone, and lets the jury go dark", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();

    expect((await generateAvatar(cookie, withAvatarKeyOnly())).status).toBe(
      201,
    );
    expect(await storedAvatar()).toEqual(SPRITE_BYTES);

    const id = await uploadPhotoId(cookie, { bindings: withAvatarKeyOnly() });
    const scored = await storedScore(id);
    expect(scored?.ai_score).toBe(5);
    expect(scored?.ai_status).toBe("failed");
    // One call, the avatar's: the jury never reached for the paid key.
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it("judges on the jury's key alone, and answers offline without spending a slot", async () => {
    const fetched = stubGemini(geminiDayReply);
    const cookie = await signIn();

    const id = await uploadPhotoId(cookie, { bindings: withJuryKeyOnly() });
    expect((await storedScore(id))?.ai_status).toBe("ok");

    for (const attempt of [1, 2]) {
      const res = await generateAvatar(cookie, withJuryKeyOnly());
      expect(res.status, `attempt ${String(attempt)}`).toBe(503);
      expect(apiErrorSchema.parse(await res.json()).error).toMatch(/offline/i);
      // Refunded, so the second attempt is not one slot poorer than the first.
      expect((await avatarState(cookie)).remaining).toBe(AVATAR_DAILY_LIMIT);
    }
    expect(await storedAvatar()).toBeNull();
    expect(
      fetched.mock.calls.filter(([url]) => url.includes(GEMINI_IMAGE_MODEL)),
    ).toEqual([]);
  });

  it("goes dark on both sides when neither key is set", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();

    expect((await generateAvatar(cookie, withoutGeminiKey())).status).toBe(503);
    const id = await uploadPhotoId(cookie, { bindings: withoutGeminiKey() });
    expect((await storedScore(id))?.ai_status).toBe("failed");
    expect(fetched).not.toHaveBeenCalled();
    expect((await avatarState(cookie)).remaining).toBe(AVATAR_DAILY_LIMIT);
  });

  it("closes the machine when an admin sets the town cap to 0", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();
    expect(
      (await patchAvatarCaps(cookie, { limit: 10, townLimit: 0 })).status,
    ).toBe(200);

    const refused = await generateAvatar(cookie);
    expect(refused.status).toBe(429);
    // NOT the day-filled-up copy: nothing was drawn and nobody took the last slot.
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(
      /closed for today/i,
    );
    expect(fetched).not.toHaveBeenCalled();
    // The town's cap wrote no row, so there was nothing to refund and nothing is left
    // behind for the next day's sum to carry.
    expect(await townUsed()).toBe(0);
    expect(await rowCount()).toBe(0);
    expect((await avatarState(cookie)).remaining).toBe(0);
  });

  it("still answers GET with a per-player cap of 0", async () => {
    const cookie = await signIn();
    expect(
      (await patchAvatarCaps(cookie, { limit: 0, townLimit: 50 })).status,
    ).toBe(200);
    expect(await avatarState(cookie)).toEqual({
      avatar: null,
      remaining: 0,
      limit: 0,
    });
  });

  it("lets a raised cap draw again the same day, and never reports a debt", async () => {
    stubGemini(() => avatarReply());
    const cookie = await signIn();
    await spendQuota(AVATAR_DAILY_LIMIT);
    expect((await generateAvatar(cookie)).status).toBe(429);

    expect(
      (await patchAvatarCaps(cookie, { limit: 12, townLimit: 50 })).status,
    ).toBe(200);
    expect((await avatarState(cookie)).remaining).toBe(2);
    expect((await generateAvatar(cookie)).status).toBe(201);

    // Lowered UNDER what is already spent: a floor, not a negative number.
    expect(
      (await patchAvatarCaps(cookie, { limit: 4, townLimit: 50 })).status,
    ).toBe(200);
    expect(await avatarState(cookie)).toMatchObject({ remaining: 0, limit: 4 });

    // The copy quotes the STORED cap. Seed == constant everywhere else, so this is the
    // only case that can tell an interpolated cap from a compiled-in 10.
    const refused = await generateAvatar(cookie);
    expect(refused.status).toBe(429);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(
      /all 4 avatars for today/i,
    );
  });

  it("gives the town's last slot to exactly one of two racing requests", async () => {
    const fetched = stubGemini(() => avatarReply());
    const mine = await signIn();
    const theirs = await signIn("rival");
    await spendQuota(4, "voter");
    expect(
      (await patchAvatarCaps(mine, { limit: 10, townLimit: 5 })).status,
    ).toBe(200);

    const both = await Promise.all([
      generateAvatar(mine),
      generateAvatar(theirs),
    ]);
    expect(both.map((res) => res.status).sort()).toEqual([201, 429]);
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(await townUsed()).toBe(5);

    const refused = both.find((res) => res.status === 429);
    if (refused === undefined) throw new Error("neither request was refused");
    // The stored town cap, not the compiled-in 50.
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(
      /all 5 avatars the town gets today/i,
    );
  });

  it("serves the sprite's bytes to its owner and to nobody else", async () => {
    stubGemini(() => avatarReply());
    const cookie = await signIn();

    const missing = await app.request(
      "/api/avatar/image",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(missing.status).toBe(404);

    expect((await generateAvatar(cookie)).status).toBe(201);
    const res = await app.request(
      "/api/avatar/image",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(SPRITE_BYTES);

    for (const path of ["/api/avatar", "/api/avatar/image"]) {
      expect((await app.request(path, {}, env)).status).toBe(401);
    }
    expect(
      (await app.request("/api/avatar", { method: "POST" }, env)).status,
    ).toBe(401);
  });

  // The only place a REAL generation's key is followed to the bytes it names —
  // everything else dresses a player through `/api/test/avatar` — so a `storeAvatar`
  // that answered with a handle it had not written would go unnoticed.
  it("stores a key a friend can load the generated sprite by", async () => {
    stubGemini(() => avatarReply());
    const cookie = await signIn();
    expect((await generateAvatar(cookie)).status).toBe(201);

    const key = await storedAvatarKey();
    if (key === null) throw new Error("the generation stored no key");
    const res = await app.request(
      `/api/sprites/${key}`,
      { headers: { Cookie: await signIn("rival") } },
      env,
    );
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(SPRITE_BYTES);
  });

  it("discards a sprite without handing the quota back", async () => {
    stubGemini(() => avatarReply());
    const cookie = await signIn();
    expect((await generateAvatar(cookie)).status).toBe(201);

    const res = await app.request(
      "/api/avatar",
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(avatarStateSchema.parse(await res.json())).toEqual({
      avatar: null,
      remaining: AVATAR_DAILY_LIMIT - 1,
      limit: AVATAR_DAILY_LIMIT,
    });
    expect(await storedAvatar()).toBeNull();
    expect(
      (
        await app.request(
          "/api/avatar/image",
          { headers: { Cookie: cookie } },
          env,
        )
      ).status,
    ).toBe(404);
  });

  it("stores a sprite through the test surface without spending quota", async () => {
    const cookie = await signIn();
    const form = new FormData();
    form.append(
      "sprite",
      new File([PHOTO_BYTES], "sprite.png", { type: "image/png" }),
    );
    const local = { ...env, ENVIRONMENT: "local" };
    const res = await app.request(
      "/api/test/avatar",
      { method: "POST", body: form, headers: { Cookie: cookie } },
      local,
    );
    expect(res.status).toBe(200);
    expect(await storedAvatar()).toEqual(PHOTO_BYTES);

    const state = await avatarState(cookie);
    expect(state.avatar?.url).toContain("/api/avatar/image?v=");
    expect(state.remaining).toBe(AVATAR_DAILY_LIMIT);

    const bad = new FormData();
    bad.append("sprite", new File(["nope"], "me.txt", { type: "text/plain" }));
    const refused = await app.request(
      "/api/test/avatar",
      { method: "POST", body: bad, headers: { Cookie: cookie } },
      local,
    );
    expect(refused.status).toBe(400);
  });

  it("winds the quota through the test surface, into the row the route enforces", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();
    const local = { ...env, ENVIRONMENT: "local" };

    const spent = await app.request(
      "/api/test/quota",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ used: AVATAR_DAILY_LIMIT }),
      },
      local,
    );
    expect(spent.status).toBe(200);
    expect((await avatarState(cookie)).remaining).toBe(0);
    expect((await generateAvatar(cookie)).status).toBe(429);
    expect(fetched).not.toHaveBeenCalled();

    const given = await app.request(
      "/api/test/quota",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ used: 0 }),
      },
      local,
    );
    expect(given.status).toBe(200);
    expect((await avatarState(cookie)).remaining).toBe(AVATAR_DAILY_LIMIT);

    for (const body of [{}, { used: -1 }, { used: AVATAR_DAILY_LIMIT + 1 }]) {
      const refused = await app.request(
        "/api/test/quota",
        {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        local,
      );
      expect(refused.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("refuses a source that is not an image we can send", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();
    const form = new FormData();
    form.append("photo", new File(["nope"], "me.txt", { type: "text/plain" }));
    const res = await app.request(
      "/api/avatar",
      { method: "POST", body: form, headers: { Cookie: cookie } },
      withGeminiKey(),
    );
    expect(res.status).toBe(400);
    expect(fetched).not.toHaveBeenCalled();
    expect((await avatarState(cookie)).remaining).toBe(AVATAR_DAILY_LIMIT);
  });
});
