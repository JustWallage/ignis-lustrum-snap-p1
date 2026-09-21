import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiErrorSchema,
  dayPhotosSchema,
  dayRankingSchema,
  JURY_MODELS,
} from "../../shared/api";
import { app } from "../index";
import { GEMINI_MODEL } from "../lib/gemini";
import { NO_KEY } from "../lib/photo-description";
import { NO_KEY as NO_JURY_KEY } from "../lib/photo-score";
import {
  DESCRIBED,
  DESCRIBING,
  eventAction,
  geminiCallAsking,
  geminiCallsAsking,
  geminiDayReply,
  geminiReply,
  JURY_KEY,
  keyOf,
  PAID_KEY,
  postRank,
  promptOf,
  RANKED_CRITIQUE,
  rankedScore,
  RANKING,
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
      failure: null,
    });
  });

  it("reads the batch beside the descriptions, and re-runs it on demand", async () => {
    const cookie = await signIn();
    // No key, so the operator's own run is the day-level fallback: rows for everybody
    // and a run that says it failed. It has to be ASKED for — a day one friend short
    // of the roster ranks itself never.
    const id = await uploadPhotoId(cookie);
    expect((await postRank(cookie, 1, withoutGeminiKey())).status).toBe(200);
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

  it("tells the operator why the jury failed, and forgets it on the next good run", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withoutGeminiKey() });
    expect((await postRank(cookie, 1, withoutGeminiKey())).status).toBe(200);
    expect(await dayState(cookie, 1)).toMatchObject({ failure: NO_JURY_KEY });

    stubJuryDown();
    await describeSnap(cookie, id);
    expect((await postRank(cookie, 1)).status).toBe(200);
    expect((await dayState(cookie, 1)).failure).toMatch(
      /500.*upstream is down/,
    );

    // The tie the scoring half cannot break is a failure of the RANKING, not of the
    // call, so it has to read as one too.
    stubGemini((_url, init) =>
      DESCRIBING.test(promptOf(init))
        ? geminiReply(JSON.stringify(DESCRIBED))
        : geminiReply(
            JSON.stringify({
              verdicts: [
                {
                  photoId: id,
                  score: 7,
                  critique: RANKED_CRITIQUE,
                  bonusDetected: false,
                  bonusReason: "",
                },
                {
                  photoId: id + 1000,
                  score: 7,
                  critique: RANKED_CRITIQUE,
                  bonusDetected: false,
                  bonusReason: "",
                },
              ],
            }),
          ),
    );
    expect((await postRank(cookie, 1)).status).toBe(200);
    expect((await dayState(cookie, 1)).failure).toMatch(/other photographs/);

    stubGeminiDay();
    expect((await postRank(cookie, 1)).status).toBe(200);
    expect(await dayState(cookie, 1)).toMatchObject({
      failed: false,
      failure: null,
    });
  });

  it("ranks the day it was pointed at and no other", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    expect((await postRank(cookie, 1, withoutGeminiKey())).status).toBe(200);
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
    expect((await postRank(cookie, 1, withoutGeminiKey())).status).toBe(200);
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
    // The fallback verdicts the two keyless snaps carry below, asked for rather than a
    // side effect of the uploads: a field of two on a roster of four ranks itself never.
    expect((await postRank(admin, 1, withoutGeminiKey())).status).toBe(200);

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
      { photoId: failed, status: "failed", failure: NO_KEY },
      { photoId: unscored, status: "ok", failure: null },
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
    expect((await postRank(cookie, 1, withoutGeminiKey())).status).toBe(200);

    stubGeminiDay();
    await describeSnap(cookie, id);
    // The describe route ranks nothing, so the fixed description leaves the snap on the
    // fallback verdict until the operator presses Rank the day again.
    const body = await dayBody(cookie, 1);
    expect(body.descriptions).toEqual([
      { photoId: id, status: "ok", failure: null },
    ]);
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

/** Any GA model off the allowlist that is NOT the default, so a run picking one is
 * being told apart from a run picking nothing. */
const PICKED_MODEL = JURY_MODELS.find((one) => one !== GEMINI_MODEL) ?? "";

describe("the operator's run for the whole day", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function rankableDay(): Promise<string> {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    stubGeminiDay();
    await describeSnap(cookie, id);
    return cookie;
  }

  it("asks the model the console picked, and the app's own without one", async () => {
    const cookie = await rankableDay();
    const fetched = stubGeminiDay();

    expect(
      (await postRank(cookie, 1, withGeminiKey(), { model: PICKED_MODEL }))
        .status,
    ).toBe(200);
    expect(geminiCallAsking(fetched.mock.calls, RANKING).url).toContain(
      `/${PICKED_MODEL}:generateContent`,
    );

    const plain = stubGeminiDay();
    expect((await postRank(cookie, 1)).status).toBe(200);
    expect(geminiCallAsking(plain.mock.calls, RANKING).url).toContain(
      `/${GEMINI_MODEL}:generateContent`,
    );
  });

  // The billed key is the app's rule for every jury call, so what the operator's
  // choice actually decides is the FALLBACK: a plain run may reach the free key on a
  // 429, a billed one may not.
  it("asks on the billed key either way, and only a plain run may fall back", async () => {
    const cookie = await rankableDay();
    const fetched = stubGeminiDay();

    expect((await postRank(cookie, 1)).status).toBe(200);
    expect(keyOf(geminiCallAsking(fetched.mock.calls, RANKING).init)).toBe(
      PAID_KEY,
    );

    // The billed project is out. A plain run walks on to the free key; a billed one
    // has nowhere to walk to and takes the failure.
    const spent = (url: string, init: RequestInit) =>
      keyOf(init) === PAID_KEY
        ? new Response("quota", { status: 429 })
        : geminiDayReply(url, init);

    const plain = stubGemini(spent);
    expect((await postRank(cookie, 1)).status).toBe(200);
    expect(
      geminiCallsAsking(plain.mock.calls, RANKING).map(({ init }) =>
        keyOf(init),
      ),
    ).toEqual([PAID_KEY, JURY_KEY]);

    const billed = stubGemini(spent);
    expect(
      (await postRank(cookie, 1, withGeminiKey(), { spend: "billed" })).status,
    ).toBe(200);
    expect(
      geminiCallsAsking(billed.mock.calls, RANKING).map(({ init }) =>
        keyOf(init),
      ),
    ).toEqual([PAID_KEY]);
  });

  it("refuses an override the jury has no name for, and asks nobody", async () => {
    const cookie = await rankableDay();
    const fetched = stubGeminiDay();

    for (const run of [{ model: "gemini-9-ultra" }, { spend: "free" }]) {
      const res = await postRank(cookie, 1, withGeminiKey(), run);
      expect(res.status).toBe(400);
    }
    expect(fetched.mock.calls).toHaveLength(0);
  });
});
