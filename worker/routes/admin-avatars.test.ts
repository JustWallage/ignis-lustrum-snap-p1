import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  apiErrorSchema,
  avatarCapsSchema,
  avatarCountsSchema,
} from "../../shared/api";
import { app } from "../index";
import { DEFAULT_AVATAR_CAPS } from "../lib/avatar-caps";
import { bytesToBase64 } from "../lib/bytes";
import { avatarSpend } from "../lib/gemini";
import {
  patchAvatarCaps,
  PHOTO_BYTES,
  resetWorld,
  setDay,
  signIn,
  stubGemini,
  withGeminiKey,
} from "../test-helpers";

beforeEach(resetWorld);

function avatarReply(): Response {
  return Response.json({
    candidates: [
      {
        content: {
          parts: [
            { text: "Here is your trainer!" },
            {
              inlineData: {
                mimeType: "image/png",
                data: bytesToBase64(new Uint8Array([1, 2, 3, 4])),
              },
            },
          ],
        },
      },
    ],
  });
}

async function drawOne(cookie: string): Promise<void> {
  const form = new FormData();
  form.append(
    "photo",
    new File([PHOTO_BYTES], "me.png", { type: "image/png" }),
  );
  const res = await app.request(
    "/api/avatar",
    { method: "POST", body: form, headers: { Cookie: cookie } },
    withGeminiKey(),
  );
  expect(res.status).toBe(201);
}

async function readCounts(cookie: string, day?: number) {
  const query = day === undefined ? "" : `?day=${String(day)}`;
  const res = await app.request(
    `/api/admin/avatars${query}`,
    { headers: { Cookie: cookie } },
    env,
  );
  expect(res.status).toBe(200);
  return avatarCountsSchema.parse(await res.json());
}

describe("GET /api/admin/avatars", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every friend, including the ones on nought", async () => {
    stubGemini(avatarReply);
    const admin = await signIn();
    const friend = await signIn("rival");
    await drawOne(admin);
    await drawOne(admin);
    await drawOne(friend);

    const counts = await readCounts(admin);
    expect(counts.day).toBe(1);
    expect(counts.limit).toBe(DEFAULT_AVATAR_CAPS.limit);
    expect(counts.players.map((row) => [row.user.name, row.used])).toEqual([
      ["judge", 0],
      ["rival", 1],
      ["tester", 2],
      ["voter", 0],
    ]);
    expect(JSON.stringify(counts)).not.toMatch(/avatar\/image|data|score/);
  });

  it("counts the day asked for, and defaults to the day the world is on", async () => {
    stubGemini(avatarReply);
    const admin = await signIn();
    await drawOne(admin);

    const asked = await readCounts(admin, 2);
    expect(asked.day).toBe(2);
    expect(asked.players.every((row) => row.used === 0)).toBe(true);

    try {
      await setDay(3);
      expect((await readCounts(admin)).day).toBe(3);
    } finally {
      await setDay(1);
    }
  });

  it("is admin-only, and needs a session before that", async () => {
    const friend = await signIn("rival");
    const refused = await app.request(
      "/api/admin/avatars",
      { headers: { Cookie: friend } },
      env,
    );
    expect(refused.status).toBe(403);
    expect(apiErrorSchema.parse(await refused.json()).error).toBe("Forbidden");

    const anonymous = await app.request("/api/admin/avatars", {}, env);
    expect(anonymous.status).toBe(401);
  });

  it("takes a cap and nothing else: no way to grant or reset a quota", async () => {
    const admin = await signIn();
    // PATCH moves the CAPS. A POST, PUT or DELETE is not a route at all, which is what
    // keeps "a count is not a lever" true rather than a promise in a comment.
    for (const method of ["POST", "PUT", "DELETE"]) {
      const res = await app.request(
        "/api/admin/avatars",
        { method, headers: { Cookie: admin } },
        env,
      );
      expect(res.status, method).toBe(404);
    }
    stubGemini(avatarReply);
    await drawOne(admin);
    expect(
      (await patchAvatarCaps(admin, { limit: 3, townLimit: 4 })).status,
    ).toBe(200);
    const counts = await readCounts(admin);
    expect(counts.players.find((row) => row.user.name === "tester")?.used).toBe(
      1,
    );
    expect(counts.dayTotal).toBe(1);
  });

  it("reports both caps in force, so the editor prefills what is stored", async () => {
    const admin = await signIn();
    const seeded = await readCounts(admin);
    expect(seeded.limit).toBe(DEFAULT_AVATAR_CAPS.limit);
    expect(seeded.townLimit).toBe(DEFAULT_AVATAR_CAPS.townLimit);

    const saved = await patchAvatarCaps(admin, { limit: 2, townLimit: 7 });
    expect(saved.status).toBe(200);
    expect(avatarCapsSchema.parse(await saved.json())).toEqual({
      limit: 2,
      townLimit: 7,
    });

    const stored = await readCounts(admin);
    expect(stored.limit).toBe(2);
    expect(stored.townLimit).toBe(7);
  });

  it("takes 0 as a closed machine, and refuses anything that is not a count", async () => {
    const admin = await signIn();
    expect(
      (await patchAvatarCaps(admin, { limit: 0, townLimit: 0 })).status,
    ).toBe(200);
    const closed = await readCounts(admin);
    expect(closed.limit).toBe(0);
    expect(closed.townLimit).toBe(0);

    for (const body of [
      {},
      { limit: 1 },
      { limit: -1, townLimit: 1 },
      { limit: 1.5, townLimit: 1 },
      { limit: "10", townLimit: 50 },
    ]) {
      const refused = await patchAvatarCaps(admin, body);
      expect(refused.status, JSON.stringify(body)).toBe(400);
      expect(apiErrorSchema.parse(await refused.json()).error).not.toBe("");
    }
    expect((await readCounts(admin)).townLimit).toBe(0);
  });

  it("is admin-only on the way in as well as the way out", async () => {
    const friend = await signIn("rival");
    const refused = await patchAvatarCaps(friend, { limit: 99, townLimit: 99 });
    expect(refused.status).toBe(403);
    expect(
      (await patchAvatarCaps("", { limit: 99, townLimit: 99 })).status,
    ).toBe(401);
    expect((await readCounts(await signIn())).limit).toBe(
      DEFAULT_AVATAR_CAPS.limit,
    );
  });

  // e2e runs `workers: 1` against ONE shared database, and admin.spec.ts closes the
  // machine before avatar.spec.ts asserts a 503 out of an unmocked POST.
  it("hands both caps back to their defaults on a reset", async () => {
    const admin = await signIn();
    expect(
      (await patchAvatarCaps(admin, { limit: 0, townLimit: 0 })).status,
    ).toBe(200);
    await resetWorld();
    const counts = await readCounts(await signIn());
    expect(counts.limit).toBe(DEFAULT_AVATAR_CAPS.limit);
    expect(counts.townLimit).toBe(DEFAULT_AVATAR_CAPS.townLimit);
  });

  it("bills the town for every sprite it has ever drawn, as an estimate", async () => {
    stubGemini(avatarReply);
    const admin = await signIn();
    const friend = await signIn("rival");
    await drawOne(admin);
    await drawOne(friend);

    const today = await readCounts(admin);
    expect(today.dayTotal).toBe(2);
    expect(today.allTime).toBe(2);
    expect(today.estimate).toEqual(avatarSpend(2));
    expect(today.estimate.amount).toBeCloseTo(0.09, 5);
    expect(today.estimate.currency).toBe("USD");

    try {
      await setDay(2);
      await drawOne(admin);
      const tomorrow = await readCounts(admin);
      expect(tomorrow.dayTotal).toBe(1);
      expect(tomorrow.allTime).toBe(3);
      expect(tomorrow.estimate).toEqual(avatarSpend(3));
    } finally {
      await setDay(1);
    }
  });

  it("prices nothing on the wire — no per-image figure crosses it", async () => {
    stubGemini(avatarReply);
    const admin = await signIn();
    await drawOne(admin);
    const res = await app.request(
      "/api/admin/avatars",
      { headers: { Cookie: admin } },
      env,
    );
    const body = await res.text();
    expect(body).toContain('"estimate"');
    expect(body).not.toContain("0.045");
    expect(body).not.toMatch(/price/i);
  });

  it("does not leak a spent quota out of the D1 row it lives in", async () => {
    stubGemini(avatarReply);
    const admin = await signIn();
    await drawOne(admin);
    const row = await env.DB.prepare(
      "SELECT used FROM avatar_generations" +
        " JOIN users ON users.id = avatar_generations.user_id" +
        " WHERE users.name = 'tester' AND day = 1",
    ).first();
    const stored = z.object({ used: z.int() }).parse(row).used;
    const counts = await readCounts(admin);
    expect(counts.players.find((p) => p.user.name === "tester")?.used).toBe(
      stored,
    );
  });
});
