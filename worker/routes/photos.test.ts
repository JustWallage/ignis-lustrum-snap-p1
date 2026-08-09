import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  commentListSchema,
  likeResultSchema,
  mySubmissionSchema,
  photoSchema,
} from "../../shared/api";
import { gameStateSchema } from "../../shared/state";
import { app } from "../index";
import {
  getJson,
  PHOTO_BYTES,
  resetWorld,
  rowsForDay,
  setDay,
  setPhase,
  signIn,
  storedDay,
  uploadPhoto,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

describe("snaps", () => {
  it("stamps the upload with the current day", async () => {
    const cookie = await signIn();
    expect(await storedDay(await uploadPhotoId(cookie))).toBe(1);
    try {
      await setDay(4);
      expect(await storedDay(await uploadPhotoId(cookie))).toBe(4);
    } finally {
      await setDay(1);
    }
  });

  it("no longer serves the retired public snap map", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    const res = await app.request("/api/map", {}, env);
    expect(res.status).not.toBe(200);
  });

  it("ignores tile coordinates a stale client still sends", async () => {
    const cookie = await signIn();
    const form = new FormData();
    form.append(
      "photo",
      new File([PHOTO_BYTES], "x.png", { type: "image/png" }),
    );
    form.append("x", "0");
    form.append("y", "0");
    const ctx = createExecutionContext();
    const res = await app.request(
      "/api/photos",
      { method: "POST", body: form, headers: { Cookie: cookie } },
      env,
      ctx,
    );
    expect(res.status).toBe(201);
    await waitOnExecutionContext(ctx);
  });

  it("keeps snap details behind the session cookie", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    const detail = await app.request(`/api/photos/${id}`, {}, env);
    expect(detail.status).toBe(401);
    const image = await app.request(`/api/photos/${id}/image`, {}, env);
    expect(image.status).toBe(401);
  });

  it("round-trips the stored image bytes", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    const res = await app.request(
      `/api/photos/${id}/image`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PHOTO_BYTES);
  });

  it("returns snap details with uploader and counts", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    const res = await app.request(
      `/api/photos/${id}`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(photoSchema.parse(await res.json())).toMatchObject({
      uploader: { name: "tester" },
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
    });
  });

  it("has nowhere to put a caption a stale client still sends", async () => {
    const cookie = await signIn();
    const created = await uploadPhoto(cookie, { caption: "wrote it myself" });
    expect(created.status).toBe(201);
    const fresh = photoSchema.parse(await created.json());
    expect(JSON.stringify(fresh)).not.toContain("caption");
    expect(JSON.stringify(fresh)).not.toContain("wrote it myself");

    const stored = await getJson(`/api/photos/${fresh.id}`, cookie);
    expect(JSON.stringify(stored)).not.toContain("wrote it myself");
  });

  it("toggles likes", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    const liked = await app.request(
      `/api/photos/${id}/like`,
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    expect(likeResultSchema.parse(await liked.json())).toMatchObject({
      likeCount: 1,
      likedByMe: true,
    });
    const unliked = await app.request(
      `/api/photos/${id}/like`,
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(likeResultSchema.parse(await unliked.json())).toMatchObject({
      likeCount: 0,
      likedByMe: false,
    });
  });

  it("takes exactly one submission per user per day", async () => {
    const cookie = await signIn();
    const first = await uploadPhotoId(cookie);

    const second = await uploadPhoto(cookie);
    expect(second.status).toBe(409);
    expect(apiErrorSchema.parse(await second.json()).error).toMatch(
      /already submitted/i,
    );

    expect(await rowsForDay(1)).toBe(1);
    expect(await storedDay(first)).toBe(1);
    const state = await app.request("/api/state", {}, env);
    expect(gameStateSchema.parse(await state.json()).submissionCount).toBe(1);
  });

  it("keeps the one-a-day rule in the database, not just in the route", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    // The route reads no state to decide — it inserts and reads the constraint
    // violation — so two POSTs racing each other cannot both land.
    await expect(
      env.DB.prepare(
        "INSERT INTO photos (user_id, r2_key, content_type, day, created_at)" +
          " SELECT user_id, r2_key, content_type, day, created_at FROM photos",
      ).run(),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("opens the field again on a new day", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    try {
      await setDay(2);
      expect(await storedDay(await uploadPhotoId(cookie))).toBe(2);
      expect(await rowsForDay(1)).toBe(1);
      expect(await rowsForDay(2)).toBe(1);
    } finally {
      await setDay(1);
    }
  });

  it("keeps the uploader off a snap while its day is still being voted on", async () => {
    const mine = await signIn();
    const theirs = await signIn("rival");
    const id = await uploadPhotoId(theirs);

    expect(
      photoSchema.parse(await getJson(`/api/photos/${id}`, mine)),
    ).toMatchObject({ uploader: null });
    expect(
      photoSchema.parse(await getJson(`/api/photos/${id}`, theirs)),
    ).toMatchObject({ uploader: { name: "rival" } });

    expect((await setPhase(mine, "reveal")).status).toBe(200);
    expect(
      photoSchema.parse(await getJson(`/api/photos/${id}`, mine)),
    ).toMatchObject({ uploader: { name: "rival" } });
  });

  it("leaves a finished day's snaps named", async () => {
    const mine = await signIn();
    const id = await uploadPhotoId(await signIn("rival"));
    try {
      await setDay(2);
      expect(
        photoSchema.parse(await getJson(`/api/photos/${id}`, mine)),
      ).toMatchObject({ uploader: { name: "rival" } });
    } finally {
      await setDay(1);
    }
  });

  it("refuses uploads once the live event has taken over", async () => {
    const cookie = await signIn();
    expect((await setPhase(cookie, "countdown")).status).toBe(200);
    const res = await uploadPhoto(cookie);
    expect(res.status).toBe(409);
    expect(apiErrorSchema.parse(await res.json()).error).toMatch(
      /submissions are closed/i,
    );
    expect(await rowsForDay(1)).toBe(0);
  });

  it("replaces the day's submission, leaving exactly one row", async () => {
    const cookie = await signIn();
    const old = await uploadPhotoId(cookie);
    await app.request(
      `/api/photos/${old}/like`,
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    await app.request(
      `/api/photos/${old}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ body: "worth another go" }),
      },
      env,
    );

    const swapped = await uploadPhoto(cookie, { replace: true });
    expect(swapped.status).toBe(201);
    const fresh = photoSchema.parse(await swapped.json());
    expect(fresh.id).not.toBe(old);

    expect(await rowsForDay(1)).toBe(1);
    expect(await storedDay(fresh.id)).toBe(1);
    const gone = await app.request(
      `/api/photos/${old}`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(gone.status).toBe(404);
    const comments = await app.request(
      `/api/photos/${old}/comments`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(commentListSchema.parse(await comments.json()).comments).toEqual([]);

    const state = await app.request("/api/state", {}, env);
    expect(gameStateSchema.parse(await state.json()).submissionCount).toBe(1);
  });

  it("takes a replace as a plain submission when nothing is in yet", async () => {
    const cookie = await signIn();
    const res = await uploadPhoto(cookie, { replace: true });
    expect(res.status).toBe(201);
    expect(await rowsForDay(1)).toBe(1);
  });

  it("tells the caller whether they have already submitted", async () => {
    const cookie = await signIn();
    const before = await app.request(
      "/api/photos/mine",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(before.status).toBe(200);
    expect(mySubmissionSchema.parse(await before.json())).toEqual({
      day: 1,
      photo: null,
    });

    const id = await uploadPhotoId(cookie);
    const after = await app.request(
      "/api/photos/mine",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(mySubmissionSchema.parse(await after.json())).toMatchObject({
      day: 1,
      photo: { id, uploader: { name: "tester" } },
    });

    const other = await app.request(
      "/api/photos/mine?day=2",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(mySubmissionSchema.parse(await other.json())).toEqual({
      day: 2,
      photo: null,
    });
  });

  it("keeps a caller's own submission behind the session cookie", async () => {
    const res = await app.request("/api/photos/mine", {}, env);
    expect(res.status).toBe(401);
  });
});
