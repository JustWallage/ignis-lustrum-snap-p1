import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiErrorSchema,
  dayPhotosSchema,
  dayRankingSchema,
} from "../../shared/api";
import { app } from "../index";
import {
  DESCRIBED,
  DESCRIBING,
  eventAction,
  geminiReply,
  postRank,
  promptOf,
  RANKED_CRITIQUE,
  rankedScore,
  resetWorld,
  setDay,
  signIn,
  storedDayScores,
  storedScore,
  stubGemini,
  stubGeminiDay,
  uploadPhotoId,
  withGeminiKey,
  withoutGeminiKey,
} from "../test-helpers";

beforeEach(resetWorld);

async function describeSnap(cookie: string, id: number): Promise<void> {
  const res = await app.request(
    `/api/admin/photos/${String(id)}/describe`,
    { method: "POST", headers: { Cookie: cookie } },
    withGeminiKey(),
  );
  expect(res.status).toBe(200);
}

async function dayBody(cookie: string, day: number) {
  const res = await app.request(
    `/api/admin/days/${String(day)}/photos`,
    { headers: { Cookie: cookie } },
    env,
  );
  expect(res.status).toBe(200);
  return dayPhotosSchema.parse(await res.json());
}

async function dayState(cookie: string, day: number) {
  return (await dayBody(cookie, day)).ranking;
}

/** Neither parallel array is ordered by the route, and both are keyed by `photoId`. */
function byPhoto<T extends { photoId: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((one, other) => one.photoId - other.photoId);
}

/** A ranking run that threw writes no `photo_scores` row at all, which is how a snap
 * ends up described and unscored. */
function stubJuryDown() {
  return stubGemini((_url, init) =>
    DESCRIBING.test(promptOf(init))
      ? geminiReply(JSON.stringify(DESCRIBED))
      : new Response("upstream is down", { status: 500 }),
  );
}

describe("the day's jury batch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a friend out of the operator surface entirely", async () => {
    const admin = await signIn();
    await uploadPhotoId(admin);
    const friend = await signIn("rival");

    for (const path of ["/api/admin/days/1/photos", "/api/admin/days/1/rank"]) {
      const res = await app.request(
        path,
        { method: "POST", headers: { Cookie: friend } },
        env,
      );
      expect(res.status).toBe(403);
      expect(apiErrorSchema.parse(await res.json()).error).toBe("Forbidden");
    }
  });

  it("says a day has never been ranked before anybody hands anything in", async () => {
    const cookie = await signIn();
    expect(await dayState(cookie, 3)).toEqual({
      generated: false,
      ranAt: null,
      failed: false,
    });
  });

  it("reads the batch beside the descriptions, and re-runs it on demand", async () => {
    const cookie = await signIn();
    // No key, so the upload's own run is the day-level fallback: rows for everybody
    // and a run that says it failed.
    const id = await uploadPhotoId(cookie);
    const broken = await dayState(cookie, 1);
    expect(broken).toMatchObject({ generated: true, failed: true });
    expect(broken.ranAt).not.toBeNull();

    // Both of the operator's buttons, in the order the console reads them: an undescribed
    // snap is left out of the batch, so the day cannot be re-ranked until it is described.
    stubGeminiDay();
    await describeSnap(cookie, id);
    const again = await postRank(cookie, 1);
    expect(again.status).toBe(200);
    expect(dayRankingSchema.parse(await again.json())).toMatchObject({
      generated: true,
      failed: false,
    });

    expect(await storedScore(id)).toMatchObject({
      ai_score: rankedScore(0),
      critique: RANKED_CRITIQUE,
      ai_status: "ok",
    });
    expect(await dayState(cookie, 1)).toMatchObject({ failed: false });
  });

  it("ranks the day it was pointed at and no other", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    await setDay(2);
    const later = await uploadPhotoId(cookie);

    stubGeminiDay();
    await describeSnap(cookie, later);
    expect((await postRank(cookie, 2)).status).toBe(200);

    expect(await dayState(cookie, 2)).toMatchObject({ failed: false });
    expect(await dayState(cookie, 1)).toMatchObject({ failed: true });
    expect(await storedDayScores(2)).toEqual([rankedScore(0)]);
    expect(await storedDayScores(1)).toEqual([5]);
  });

  it("refuses while an event is live, and the day keeps its verdicts", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    stubGeminiDay();
    await describeSnap(cookie, id);
    expect((await eventAction(cookie, "start")).status).toBe(200);

    const refused = await postRank(cookie, 1);
    expect(refused.status).toBe(409);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(/event/i);
    expect(await storedDayScores(1)).toEqual([5]);
  });

  it("404s a day that is not a day", async () => {
    const cookie = await signIn();
    const res = await app.request(
      "/api/admin/days/nope/rank",
      { method: "POST", headers: { Cookie: cookie } },
      withGeminiKey(),
    );
    expect(res.status).toBe(404);
  });

  it("says which of the two passes each snap of the day is stuck in", async () => {
    const admin = await signIn();
    const bare = await uploadPhotoId(admin, { bindings: withoutGeminiKey() });
    const failed = await uploadPhotoId(await signIn("rival"), {
      bindings: withoutGeminiKey(),
    });

    stubJuryDown();
    const unscored = await uploadPhotoId(await signIn("voter"), {
      bindings: withGeminiKey(),
    });
    // The upload's own pass always writes a description row, so taking it away is the
    // only way to hold the state the console reads between a 201 and that row landing.
    await env.DB.prepare("DELETE FROM photo_descriptions WHERE photo_id = ?")
      .bind(bare)
      .run();

    const body = await dayBody(admin, 1);
    expect(byPhoto(body.descriptions)).toEqual([
      { photoId: failed, status: "failed" },
      { photoId: unscored, status: "ok" },
    ]);
    expect(byPhoto(body.verdicts)).toEqual([
      { photoId: bare, aiStatus: "failed" },
      { photoId: failed, aiStatus: "failed" },
    ]);

    stubGeminiDay();
    expect((await postRank(admin, 1)).status).toBe(200);
    expect(byPhoto((await dayBody(admin, 1)).verdicts)).toEqual([
      { photoId: bare, aiStatus: "failed" },
      { photoId: failed, aiStatus: "failed" },
      { photoId: unscored, aiStatus: "ok" },
    ]);
  });

  it("moves a described snap out of the broken set without giving it a verdict", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withoutGeminiKey() });

    stubGeminiDay();
    await describeSnap(cookie, id);
    // The describe route ranks nothing, so the fixed description leaves the snap on the
    // fallback verdict until the operator presses Rank the day again.
    const body = await dayBody(cookie, 1);
    expect(body.descriptions).toEqual([{ photoId: id, status: "ok" }]);
    expect(body.verdicts).toEqual([{ photoId: id, aiStatus: "failed" }]);
    expect(await storedDayScores(1)).toEqual([5]);
  });

  it("serves the batch's state and never a score or a critique", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    stubGeminiDay();

    const res = await postRank(cookie, 1);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain(RANKED_CRITIQUE);
    expect(body).not.toContain("critique");
    expect(body).not.toContain("score");

    const listed = await app.request(
      "/api/admin/days/1/photos",
      { headers: { Cookie: cookie } },
      env,
    );
    const day = await listed.text();
    expect(day).not.toContain(RANKED_CRITIQUE);
    expect(day).not.toContain("critique");
    expect(
      dayPhotosSchema.parse(JSON.parse(day)).photos.map((one) => one.aiScore),
    ).toEqual([null]);
  });
});
