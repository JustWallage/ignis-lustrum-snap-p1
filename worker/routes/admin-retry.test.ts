import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiErrorSchema, evaluationRetrySchema } from "../../shared/api";
import { app } from "../index";
import {
  failedCount,
  geminiReply,
  postRetry,
  resetWorld,
  scoreRowCount,
  setDay,
  signIn,
  storedScore,
  stubGemini,
  uploadPhotoId,
  VERDICT,
} from "../test-helpers";

beforeEach(resetWorld);

describe("the admin retry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a friend out of the operator surface entirely", async () => {
    const admin = await signIn();
    const id = await uploadPhotoId(admin);
    const friend = await signIn("rival");

    for (const call of [
      { method: "GET", path: "/api/admin/evaluate" },
      { method: "POST", path: "/api/admin/evaluate" },
      { method: "POST", path: `/api/admin/photos/${id}/evaluate` },
    ]) {
      const res = await app.request(
        call.path,
        { method: call.method, headers: { Cookie: friend } },
        env,
      );
      expect(res.status).toBe(403);
      expect(apiErrorSchema.parse(await res.json()).error).toBe("Forbidden");
    }
    expect(await failedCount(admin)).toBe(1);
  });

  it("flips one failed verdict to ok", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    expect(await storedScore(id)).toMatchObject({ ai_status: "failed" });

    const fetched = stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const res = await postRetry(cookie, `/api/admin/photos/${id}/evaluate`);

    expect(res.status).toBe(200);
    expect(evaluationRetrySchema.parse(await res.json())).toEqual({
      day: 1,
      attempted: 1,
      ok: 1,
      failed: 0,
    });
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(await storedScore(id)).toEqual({
      ai_score: 9,
      critique: VERDICT.critique,
      caption: VERDICT.caption,
      bonus_detected: 1,
      bonus_reason: VERDICT.bonusReason,
      ai_status: "ok",
    });
    expect(await scoreRowCount()).toBe(1);
  });

  it("still reports a failure that fails a second time", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);

    stubGemini(() => new Response("still down", { status: 500 }));
    const res = await postRetry(cookie, `/api/admin/photos/${id}/evaluate`);

    expect(res.status).toBe(200);
    expect(evaluationRetrySchema.parse(await res.json())).toMatchObject({
      attempted: 1,
      ok: 0,
      failed: 1,
    });
    expect(await storedScore(id)).toMatchObject({ ai_status: "failed" });
    expect(await failedCount(cookie)).toBe(1);
  });

  it("404s on a snap that does not exist", async () => {
    const cookie = await signIn();
    stubGemini(() => geminiReply(JSON.stringify(VERDICT)));

    const res = await postRetry(cookie, "/api/admin/photos/9999/evaluate");
    expect(res.status).toBe(404);
  });

  it("retries a whole day, and only that day", async () => {
    const admin = await signIn();
    const rival = await signIn("rival");
    await uploadPhotoId(admin);
    const rivalSnap = await uploadPhotoId(rival);
    await setDay(2);
    const laterSnap = await uploadPhotoId(admin);

    expect(await failedCount(admin, 1)).toBe(2);
    expect(await failedCount(admin)).toBe(1);

    const fetched = stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const res = await postRetry(admin, "/api/admin/evaluate?day=1");

    expect(res.status).toBe(200);
    expect(evaluationRetrySchema.parse(await res.json())).toEqual({
      day: 1,
      attempted: 2,
      ok: 2,
      failed: 0,
    });
    expect(fetched).toHaveBeenCalledTimes(2);
    expect(await storedScore(rivalSnap)).toMatchObject({ ai_status: "ok" });
    expect(await storedScore(laterSnap)).toMatchObject({ ai_status: "failed" });
    expect(await failedCount(admin, 1)).toBe(0);
    expect(await failedCount(admin, 2)).toBe(1);
  });

  it("defaults to the day the world is on, and does nothing when nothing broke", async () => {
    const cookie = await signIn();
    await setDay(4);
    const fetched = stubGemini(() => geminiReply(JSON.stringify(VERDICT)));

    const res = await postRetry(cookie, "/api/admin/evaluate");
    expect(res.status).toBe(200);
    expect(evaluationRetrySchema.parse(await res.json())).toEqual({
      day: 4,
      attempted: 0,
      ok: 0,
      failed: 0,
    });
    expect(fetched).not.toHaveBeenCalled();
  });

  it("serves counts and never a score or a critique", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    stubGemini(() => geminiReply(JSON.stringify(VERDICT)));

    const responses = [
      await app.request(
        "/api/admin/evaluate",
        { headers: { Cookie: cookie } },
        env,
      ),
      await postRetry(cookie, `/api/admin/photos/${id}/evaluate`),
    ];
    for (const res of responses) {
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).not.toContain(VERDICT.critique);
      expect(body).not.toContain("critique");
      expect(body).not.toContain("score");
    }
  });
});
