import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  archiveSchema,
  dayResultsSchema,
  prizeListSchema,
} from "../../shared/api";
import { HALF_WEIGHT } from "../../shared/scoring";
import { app } from "../index";
import {
  getJson,
  PHOTO_BASE64,
  playToLanding,
  putVotes,
  resetWorld,
  setDay,
  setPhase,
  signIn,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

describe("day results", () => {
  const RESULTS = "/api/days/1/results";

  const JURY_CAPTION = "Study In Fluorescent Regret";

  async function results(cookie: string) {
    return dayResultsSchema.parse(await getJson(RESULTS, cookie));
  }

  it("refuses a day that has not been revealed yet", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);

    const res = await app.request(
      RESULTS,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(await res.json()).error).toMatch(/revealed/i);

    expect((await setPhase(cookie, "countdown")).status).toBe(200);
    expect(
      (await app.request(RESULTS, { headers: { Cookie: cookie } }, env)).status,
    ).toBe(403);

    expect(
      (
        await app.request(
          "/api/days/9/results",
          { headers: { Cookie: cookie } },
          env,
        )
      ).status,
    ).toBe(403);
  });

  it("unmasks the uploaders once the day reaches reveal", async () => {
    const mine = await signIn();
    const theirs = await signIn("rival");
    const voter = await signIn("voter");
    const first = await uploadPhotoId(mine);
    const second = await uploadPhotoId(theirs);
    expect((await putVotes(voter, [second, first])).status).toBe(200);
    expect((await putVotes(mine, [second])).status).toBe(200);
    expect((await setPhase(voter, "reveal")).status).toBe(200);

    const { day, results: ranked } = await results(voter);
    expect(day).toBe(1);
    expect(ranked.map((one) => one.uploader.name)).toEqual(["tester", "rival"]);
    expect(ranked.map((one) => one.rank)).toEqual([1, 2]);
    expect(ranked.map((one) => one.noVotePenalty)).toEqual([false, true]);
    expect(ranked.map((one) => one.photoId)).toEqual([first, second]);
    expect(ranked.map((one) => one.peerPoints)).toEqual([2, 6]);
    expect(ranked.map((one) => one.url)).toEqual([
      `/api/photos/${first}/image`,
      `/api/photos/${second}/image`,
    ]);

    const [winner, loser] = ranked;
    expect(winner?.aiNorm).toBe(HALF_WEIGHT);
    expect(loser?.aiNorm).toBe(HALF_WEIGHT);
    expect(winner?.peerNorm).toBeCloseTo(HALF_WEIGHT / 3);
    expect(loser?.peerNorm).toBe(HALF_WEIGHT);
    expect(winner?.total).toBeCloseTo(HALF_WEIGHT + HALF_WEIGHT / 3);
    expect(loser?.total).toBe(HALF_WEIGHT);
    expect(winner?.critique).toContain("jury");
    expect(winner?.bonus).toBe(false);
    expect(winner?.juryCaption).toBeNull();
    expect(loser?.juryCaption).toBeNull();
  });

  it("serves the jury's caption, and only once the day is revealed", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    const written = await app.request(
      "/api/test/caption",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: id, caption: JURY_CAPTION }),
      },
      env,
    );
    expect(written.status).toBe(200);

    const early = await app.request(
      RESULTS,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(early.status).toBe(403);
    expect(await early.text()).not.toContain(JURY_CAPTION);

    expect((await setPhase(cookie, "reveal")).status).toBe(200);
    const { results: ranked } = await results(cookie);
    expect(ranked[0]?.juryCaption).toBe(JURY_CAPTION);
    expect(ranked[0]?.critique).toContain("jury");
  });

  it("404s a caption for a snap that does not exist", async () => {
    const cookie = await signIn();
    const res = await app.request(
      "/api/test/caption",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: 9999, caption: JURY_CAPTION }),
      },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("keeps a finished day revealed without needing a phase", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    try {
      await setDay(2);
      const { results: ranked } = await results(cookie);
      expect(ranked.map((one) => one.photoId)).toEqual([id]);
      expect(ranked[0]?.uploader.name).toBe("tester");
    } finally {
      await setDay(1);
    }
  });

  it("answers a revealed day with nothing in it as an empty scoreboard", async () => {
    const cookie = await signIn();
    expect((await setPhase(cookie, "reveal")).status).toBe(200);
    expect(await results(cookie)).toEqual({ day: 1, results: [] });
  });

  it("keeps the scoreboard behind the session cookie", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    expect((await setPhase(cookie, "reveal")).status).toBe(200);
    expect((await app.request(RESULTS, {}, env)).status).toBe(401);
  });
});

describe("the archive", () => {
  const ARCHIVE = "/api/days";

  async function archive(cookie: string) {
    return archiveSchema.parse(await getJson(ARCHIVE, cookie));
  }

  it("is empty while the only day there has ever been is still being voted on", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    expect(await archive(cookie)).toEqual({ days: [] });
  });

  it("lists only the revealed days, newest first", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    try {
      await setDay(3);
      const listed = await archive(cookie);
      expect(listed.days.map((one) => one.day)).toEqual([2, 1]);
      expect(listed.days.find((one) => one.day === 2)?.results).toEqual([]);

      expect((await setPhase(cookie, "reveal")).status).toBe(200);
      expect((await archive(cookie)).days.map((one) => one.day)).toEqual([
        3, 2, 1,
      ]);
    } finally {
      await setDay(1);
    }
  });

  it("carries the names, the scores and the critiques of every day at once", async () => {
    const mine = await signIn();
    const theirs = await signIn("rival");
    const first = await uploadPhotoId(mine);
    try {
      await setDay(2);
      const second = await uploadPhotoId(theirs);
      await setDay(3);

      const [dayTwo, dayOne] = (await archive(mine)).days;
      expect(dayTwo?.day).toBe(2);
      expect(dayOne?.day).toBe(1);
      const winner = dayOne?.results[0];
      expect(winner?.photoId).toBe(first);
      expect(winner?.uploader.name).toBe("tester");
      expect(winner?.aiNorm).toBe(HALF_WEIGHT);
      expect(winner?.peerNorm).toBe(0);
      expect(winner?.critique).toContain("jury");
      expect(winner?.url).toBe(`/api/photos/${first}/image`);
      expect(dayTwo?.results[0]?.uploader.name).toBe("rival");
      expect(dayTwo?.results[0]?.photoId).toBe(second);

      expect(dayOne?.results.map((one) => one.rank)).toEqual([1]);
      expect(dayTwo?.results.map((one) => one.rank)).toEqual([1]);
      expect(winner?.noVotePenalty).toBe(true);
      expect(dayTwo?.results[0]?.noVotePenalty).toBe(true);
    } finally {
      await setDay(1);
    }
  });

  it("hands back the history without a single image byte in it", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    try {
      await setDay(2);
      // Read as TEXT: a parse would drop an extra field before the assertion saw it.
      const raw = await app.request(
        ARCHIVE,
        { headers: { Cookie: cookie } },
        env,
      );
      const body = await raw.text();
      expect(body).toContain("/image");
      expect(body).not.toContain(PHOTO_BASE64);
    } finally {
      await setDay(1);
    }
  });

  it("stays behind the session cookie like every other scoreboard", async () => {
    expect((await app.request(ARCHIVE, {}, env)).status).toBe(401);
  });

  it("says what the winner won, and nothing on a day that never landed", async () => {
    const landed = await playToLanding();
    const cookie = await signIn();
    try {
      await setDay(3);
      const { days } = await archive(cookie);
      expect(days.map((one) => one.day)).toEqual([2, 1]);
      expect(days.find((one) => one.day === 1)?.prize).toBe(landed);
      expect(days.find((one) => one.day === 2)?.prize).toBeNull();
    } finally {
      await setDay(1);
    }
  });

  it("keeps saying what was won after the prize itself is renamed", async () => {
    const landed = await playToLanding();
    const cookie = await signIn();
    try {
      await setDay(3);
      const listed = await app.request(
        "/api/prizes",
        { headers: { Cookie: cookie } },
        env,
      );
      expect(listed.status).toBe(200);
      const { prizes } = prizeListSchema.parse(await listed.json());
      const won = prizes.find((prize) => prize.label === landed);
      if (won === undefined) throw new Error("nothing on the wheel matches");
      const renamed = await app.request(
        `/api/prizes/${String(won.id)}`,
        {
          method: "PATCH",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ label: "Something else entirely" }),
        },
        env,
      );
      expect(renamed.status).toBe(200);

      // The award carries a COPY of the label, taken when it was won. Joining back
      // to the prize row is exactly how last week's trophy would quietly become
      // whatever an admin renamed that segment to.
      expect(
        (await archive(cookie)).days.find((one) => one.day === 1)?.prize,
      ).toBe(landed);
    } finally {
      await setDay(1);
    }
  });

  it("keeps an unrevealed day out of the archive, its prize with it", async () => {
    const landed = await playToLanding();
    const cookie = await signIn();
    await setDay(1);
    expect(await archive(cookie)).toEqual({ days: [] });
    const raw = await app.request(
      ARCHIVE,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(await raw.text()).not.toContain(landed);
  });

  it("adds the awards in one query, however many days it is asked for", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    try {
      await setDay(2);
      const one = countingD1();
      expect(
        (
          await app.request(
            ARCHIVE,
            { headers: { Cookie: cookie } },
            one.bindings,
          )
        ).status,
      ).toBe(200);
      expect(one.prepared()).toBeGreaterThan(0);

      await setDay(9);
      const eight = countingD1();
      expect(
        (
          await app.request(
            ARCHIVE,
            { headers: { Cookie: cookie } },
            eight.bindings,
          )
        ).status,
      ).toBe(200);

      expect(eight.prepared()).toBe(one.prepared());
      expect(eight.prepared()).toBeLessThan(8);
    } finally {
      await setDay(1);
    }
  });
});

/** A D1 that counts the statements prepared through it, so "how many queries" is
 * asserted rather than read off the source. Only `prepare` and `batch` are wrapped —
 * between them they are the whole of what Drizzle reaches for. */
function countingD1(): { bindings: object; prepared: () => number } {
  let prepared = 0;
  const inner = env.DB;
  return {
    bindings: {
      ...env,
      DB: {
        prepare(query: string): D1PreparedStatement {
          prepared += 1;
          return inner.prepare(query);
        },
        // A batch is however many already-prepared statements in one trip, so it
        // counts nothing of its own.
        batch<T = unknown>(
          statements: D1PreparedStatement[],
        ): Promise<D1Result<T>[]> {
          return inner.batch<T>(statements);
        },
      },
    },
    prepared: () => prepared,
  };
}
