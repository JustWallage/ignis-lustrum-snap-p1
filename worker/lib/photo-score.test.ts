import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { dayRankingSchema, photoSchema } from "../../shared/api";
import { juryForDay } from "../../shared/juries";
import { app } from "../index";
import {
  DESCRIBED,
  geminiDayReply,
  geminiReply,
  photoForm,
  postRank,
  promptOf,
  RANKED_BONUS,
  RANKED_CRITIQUE,
  RANKING,
  rankedScore,
  resetWorld,
  rosterSize,
  scoreRowCount,
  setDay,
  signIn,
  storedDayScores,
  storedDescription,
  storedRanking,
  storedScore,
  stubGemini,
  stubGeminiDay,
  uploadPhoto,
  uploadPhotoId,
  withGeminiKey,
  withoutGeminiKey,
} from "../test-helpers";
import { GEMINI_MODEL } from "./gemini";

beforeEach(resetWorld);

/** Two snaps on one day, both described and both ranked — the smallest field an order
 * exists in at all. The RANK is asked for: a day two friends short of the roster ranks
 * itself never, so the operator's button is what puts an order on this field. */
async function aDescribedDay() {
  const mine = await signIn();
  const theirs = await signIn("rival");
  const fetched = stubGeminiDay();
  const first = await uploadPhotoId(mine, { bindings: withGeminiKey() });
  const second = await uploadPhotoId(theirs, { bindings: withGeminiKey() });
  expect((await postRank(mine, 1)).status).toBe(200);
  return { mine, first, second, fetched };
}

/** Every friend on the roster hands one in, which is the ONE thing that makes an upload
 * rank the day by itself. */
async function aFullDay(bindings: object = withGeminiKey()) {
  const names = ["tester", "rival", "voter", "judge"] as const;
  const ids: number[] = [];
  for (const name of names) {
    ids.push(await uploadPhotoId(await signIn(name), { bindings }));
  }
  expect(ids).toHaveLength(await rosterSize());
  return ids;
}

/** A ranking reply the test wrote itself, for the cases the well-formed stub cannot
 * produce: a tie, a gap, an id nobody sent, an older run's order. */
function rankingOf(verdicts: readonly { photoId: number; score: number }[]) {
  return geminiReply(
    JSON.stringify({
      verdicts: verdicts.map((one) => ({
        ...one,
        critique: "Iets anders, in het Nederlands.",
        bonusDetected: false,
        bonusReason: "",
      })),
    }),
  );
}

function isRanking(init: RequestInit): boolean {
  return RANKING.test(z.string().parse(init.body));
}

describe("the AI jury", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ranks the whole day in one text-only call, keyed by photo id", async () => {
    const { first, second, fetched } = await aDescribedDay();

    expect(await storedScore(first)).toEqual({
      ai_score: rankedScore(0),
      critique: RANKED_CRITIQUE,
      bonus_detected: 1,
      bonus_reason: RANKED_BONUS,
      ai_status: "ok",
    });
    expect(await storedDayScores(1)).toEqual([rankedScore(0), rankedScore(1)]);

    // The ONE ranking call, which is the operator's: neither upload made one.
    const ranked = fetched.mock.calls.filter(([, init]) => isRanking(init));
    expect(ranked).toHaveLength(1);
    const [url, init] = ranked[ranked.length - 1] ?? ["", {}];
    const prompt = promptOf(init);
    expect(url).toContain(`/${GEMINI_MODEL}:generateContent`);
    expect(z.string().parse(init.body)).not.toContain("inlineData");
    expect(prompt).toContain(`Entry ${String(first)}:`);
    expect(prompt).toContain(`Entry ${String(second)}:`);
    expect(prompt).toContain(DESCRIBED.subject);
    const jury = juryForDay(1);
    expect(prompt).toContain(jury.theme);
    expect(prompt).toContain(jury.critiquePersona);
    expect(prompt).toContain(jury.bonusPrompt);
    expect(prompt).toMatch(/critique in Dutch/i);
  });

  // The old rule ranked on EVERY upload, and a day of fourteen then claimed fourteen
  // run stamps: `rankDay` stops the moment a newer run claims one, so all but the last
  // wrote nothing and the day rode on whether that one happened to succeed.
  it("describes an arriving snap and ranks nothing while the day is short", async () => {
    const mine = await signIn();
    const theirs = await signIn("rival");
    const fetched = stubGeminiDay();

    const first = await uploadPhotoId(mine, { bindings: withGeminiKey() });
    await uploadPhotoId(theirs, { bindings: withGeminiKey() });

    expect(fetched.mock.calls.filter(([, init]) => isRanking(init))).toEqual(
      [],
    );
    expect(await storedScore(first)).toBeNull();
    expect(await storedRanking(1)).toBeNull();
  });

  it("ranks itself the moment the last friend hands one in", async () => {
    const fetched = stubGeminiDay();
    const ids = await aFullDay();

    const ranked = fetched.mock.calls.filter(([, init]) => isRanking(init));
    expect(ranked).toHaveLength(1);
    expect(await storedDayScores(1)).toEqual(
      ids.map((_id, at) => rankedScore(at)),
    );
    expect((await storedRanking(1))?.run_stamp).toBe(1);
  });

  // A swap purges one row and inserts another, so the day is full before and after —
  // and the field it is full OF has changed, which is a different question to ask.
  it("ranks again when somebody swaps a snap on a full day", async () => {
    const fetched = stubGeminiDay();
    await aFullDay();
    const again = await uploadPhoto(await signIn("rival"), {
      replace: true,
      bindings: withGeminiKey(),
    });
    expect(again.status).toBe(201);

    expect(
      fetched.mock.calls.filter(([, init]) => isRanking(init)),
    ).toHaveLength(2);
    expect((await storedRanking(1))?.run_stamp).toBe(2);
  });

  const REFUSED: [
    string,
    (ids: number[]) => { photoId: number; score: number }[],
  ][] = [
    ["a repeated score", (ids) => ids.map((id) => ({ photoId: id, score: 7 }))],
    [
      "a missing photo id",
      (ids) => ids.slice(1).map((id) => ({ photoId: id, score: 7 })),
    ],
    [
      "an id that was never sent",
      (ids) => ids.map((id, at) => ({ photoId: id + 900, score: 9 - at })),
    ],
  ];

  it.each(REFUSED)(
    "refuses a ranking with %s and leaves the day as it was",
    async (_case, build) => {
      const { mine, first, second } = await aDescribedDay();
      const before = await storedDayScores(1);

      stubGemini(() => rankingOf(build([first, second])));
      const again = await postRank(mine, 1);

      expect(again.status).toBe(200);
      expect(dayRankingSchema.parse(await again.json())).toMatchObject({
        generated: true,
        failed: true,
      });
      expect(await storedDayScores(1)).toEqual(before);
    },
  );

  it("keeps the previous verdicts when the call itself breaks", async () => {
    const { mine } = await aDescribedDay();
    const before = await storedDayScores(1);

    stubGemini(() => new Response("upstream is down", { status: 500 }));
    expect((await postRank(mine, 1)).status).toBe(200);

    expect(await storedDayScores(1)).toEqual(before);
    expect((await storedRanking(1))?.status).toBe("failed");
  });

  it("writes nothing further once a newer run has claimed the day", async () => {
    const { mine, first, second } = await aDescribedDay();

    // Run A is handed the SAME field of two and is overtaken while it writes: run B
    // claims the day mid-call, so A must stop where it is.
    let overtake = async (): Promise<void> => {
      overtake = () => Promise.resolve();
      stubGeminiDay();
      expect((await postRank(mine, 1)).status).toBe(200);
    };
    stubGemini(async () => {
      await overtake();
      return rankingOf([
        { photoId: first, score: 2.5 },
        { photoId: second, score: 2.4 },
      ]);
    });

    expect((await postRank(mine, 1)).status).toBe(200);

    const scores = await storedDayScores(1);
    expect(new Set(scores).size).toBe(scores.length);
    expect(scores).toEqual([rankedScore(0), rankedScore(1)]);
  });

  it("costs one row and not the day when a snap is retired mid-call", async () => {
    const { mine, first, second } = await aDescribedDay();

    stubGemini(async () => {
      const retired = await app.request(
        `/api/admin/photos/${String(first)}/retire`,
        { method: "POST", headers: { Cookie: mine } },
        env,
      );
      expect(retired.status).toBe(200);
      return rankingOf([
        { photoId: first, score: 7.5 },
        { photoId: second, score: 7.4 },
      ]);
    });

    expect((await postRank(mine, 1)).status).toBe(200);
    expect(await storedScore(first)).toBeNull();
    expect((await storedScore(second))?.ai_score).toBe(7.4);
  });

  it("still produces a verdict for every snap with no GEMINI_API_KEY", async () => {
    const fetched = stubGeminiDay();
    const bindings = withoutGeminiKey();
    const ids = await aFullDay(bindings);

    // EVERY snap of the day, not a sample: the fallback's whole claim is that a day
    // with no key still leaves nobody out of its own scoring.
    for (const id of ids) {
      const score = await storedScore(id);
      expect(score).toMatchObject({ ai_score: 5, ai_status: "failed" });
      expect(score?.critique).toMatch(/broke it/i);
    }
    expect((await storedRanking(1))?.status).toBe("failed");
    expect(fetched).not.toHaveBeenCalled();
  });

  it("leaves a snap nobody described out of the batch", async () => {
    const mine = await signIn();
    const theirs = await signIn("rival");
    stubGeminiDay();
    const described = await uploadPhotoId(mine, { bindings: withGeminiKey() });

    stubGemini((_url, init) =>
      isRanking(init)
        ? rankingOf([{ photoId: described, score: 8.2 }])
        : new Response("upstream is down", { status: 500 }),
    );
    const undescribed = await uploadPhotoId(theirs, {
      bindings: withGeminiKey(),
    });
    expect((await postRank(mine, 1)).status).toBe(200);

    expect((await storedScore(described))?.ai_score).toBe(8.2);
    expect(await storedScore(undescribed)).toBeNull();
  });

  it("answers the upload before the describer does", async () => {
    let answer: () => void = () => undefined;
    const thinking = new Promise<void>((resolve) => {
      answer = resolve;
    });
    stubGemini(async (url, init) => {
      await thinking;
      return geminiDayReply(url, init);
    });

    const cookie = await signIn();
    const ctx = createExecutionContext();
    const res = await app.request(
      "/api/photos",
      { method: "POST", body: photoForm({}), headers: { Cookie: cookie } },
      withGeminiKey(),
      ctx,
    );
    expect(res.status).toBe(201);
    const id = photoSchema.parse(await res.json()).id;
    // The DESCRIPTION is what an upload now waits on nothing for; the ranking is not
    // this snap's to trigger at all, one friend in on a roster of four.
    expect(await storedDescription(id)).toBeNull();

    answer();
    await waitOnExecutionContext(ctx);
    expect(await storedDescription(id)).toMatchObject({ status: "ok" });
    expect(await storedScore(id)).toBeNull();
  });

  it("drops a verdict with the snap it belongs to", async () => {
    stubGeminiDay();
    const cookie = await signIn();
    const bindings = withGeminiKey();

    const first = await uploadPhotoId(cookie, { bindings });
    const replaced = await uploadPhoto(cookie, { replace: true, bindings });
    expect(replaced.status).toBe(201);
    const second = photoSchema.parse(await replaced.json()).id;
    expect((await postRank(cookie, 1)).status).toBe(200);

    expect(await storedScore(first)).toBeNull();
    expect(await storedScore(second)).toMatchObject({ ai_status: "ok" });
    expect(await scoreRowCount()).toBe(1);

    const deleted = await app.request(
      `/api/photos/${String(second)}`,
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(deleted.status).toBe(200);
    expect(await scoreRowCount()).toBe(0);
  });

  it("ranks the day the snap is on, never the day the world moved to", async () => {
    stubGeminiDay();
    const cookie = await signIn();
    const first = await uploadPhotoId(cookie, { bindings: withGeminiKey() });
    expect((await postRank(cookie, 1)).status).toBe(200);
    await setDay(2);
    const later = await uploadPhotoId(cookie, { bindings: withGeminiKey() });
    expect((await postRank(cookie, 2)).status).toBe(200);

    expect(await storedDayScores(1)).toEqual([rankedScore(0)]);
    expect(await storedDayScores(2)).toEqual([rankedScore(0)]);
    expect((await storedRanking(1))?.run_stamp).toBe(1);
    expect(await storedScore(first)).not.toBeNull();
    expect(await storedScore(later)).not.toBeNull();
  });

  it("serves the verdict to nobody yet", async () => {
    stubGeminiDay();
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });
    expect((await postRank(cookie, 1)).status).toBe(200);

    const responses = await Promise.all([
      app.request(
        `/api/photos/${String(id)}`,
        { headers: { Cookie: cookie } },
        env,
      ),
      app.request("/api/photos/mine", { headers: { Cookie: cookie } }, env),
      app.request("/api/state", {}, env),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).not.toContain(RANKED_CRITIQUE);
      expect(body).not.toContain("critique");
      expect(body).not.toContain("score");
    }
  });
});
