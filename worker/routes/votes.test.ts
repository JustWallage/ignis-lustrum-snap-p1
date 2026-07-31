import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { ballotSchema, voteCandidateListSchema } from "../../shared/api";
import { gameStateSchema } from "../../shared/state";
import { app } from "../index";
import {
  getJson,
  openSocket,
  putVotes,
  resetWorld,
  setDay,
  setPhase,
  signIn,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

describe("voting", () => {
  it("offers today's WHOLE field, with nobody's name on any of it", async () => {
    const mine = await signIn();
    const theirs = await signIn("rival");
    const voter = await signIn("voter");
    const own = await uploadPhotoId(mine);
    const other = await uploadPhotoId(theirs);

    const raw = await getJson("/api/votes/candidates", voter);
    const { candidates } = voteCandidateListSchema.parse(raw);
    expect(candidates.map((candidate) => candidate.id)).toEqual([own, other]);
    for (const candidate of candidates) {
      expect(Object.keys(candidate).sort()).toEqual(["id", "isMine", "url"]);
      expect(candidate.isMine).toBe(false);
    }
    expect(JSON.stringify(raw)).not.toContain("tester");
    expect(JSON.stringify(raw)).not.toContain("rival");

    const forMeRaw = await getJson("/api/votes/candidates", mine);
    const forMe = voteCandidateListSchema.parse(forMeRaw);
    expect(
      forMe.candidates.map((candidate) => [candidate.id, candidate.isMine]),
    ).toEqual([
      [own, true],
      [other, false],
    ]);
    expect(JSON.stringify(forMeRaw)).not.toContain("tester");
    expect(JSON.stringify(forMeRaw)).not.toContain("rival");
  });

  it("shows the same field the public count promises, submitted or not", async () => {
    const mine = await signIn();
    await uploadPhotoId(mine);
    await uploadPhotoId(await signIn("rival"));

    const { submissionCount } = gameStateSchema.parse(
      await (await app.request("/api/state", {}, env)).json(),
    );
    expect(submissionCount).toBe(2);

    for (const cookie of [mine, await signIn("voter")]) {
      const { candidates } = voteCandidateListSchema.parse(
        await getJson("/api/votes/candidates", cookie),
      );
      expect(candidates).toHaveLength(submissionCount);
    }
  });

  it("saves a ranked top 3 and hands it back in order", async () => {
    const voter = await signIn("voter");
    const first = await uploadPhotoId(await signIn());
    const second = await uploadPhotoId(await signIn("rival"));

    expect(ballotSchema.parse(await getJson("/api/votes/mine", voter))).toEqual(
      { photoIds: [] },
    );

    const saved = await putVotes(voter, [second, first]);
    expect(saved.status).toBe(200);
    expect(ballotSchema.parse(await saved.json())).toEqual({
      photoIds: [second, first],
    });
    expect(ballotSchema.parse(await getJson("/api/votes/mine", voter))).toEqual(
      { photoIds: [second, first] },
    );
  });

  it("replaces the ballot rather than appending to it", async () => {
    const voter = await signIn("voter");
    const first = await uploadPhotoId(await signIn());
    const second = await uploadPhotoId(await signIn("rival"));

    expect((await putVotes(voter, [first, second])).status).toBe(200);
    expect((await putVotes(voter, [second])).status).toBe(200);

    expect(ballotSchema.parse(await getJson("/api/votes/mine", voter))).toEqual(
      { photoIds: [second] },
    );
    const rows = await env.DB.prepare("SELECT rank FROM votes").all();
    expect(rows.results).toEqual([{ rank: 1 }]);
  });

  it("refuses your own snap, a duplicate, and another day's", async () => {
    const voter = await signIn("voter");
    const own = await uploadPhotoId(voter);
    const other = await uploadPhotoId(await signIn());

    // Your own snap is a legal CANDIDATE now — it comes back from the browser
    // so you can look at it and talk about it — and still not a legal vote.
    // That refusal lives here and only here.
    const { candidates } = voteCandidateListSchema.parse(
      await getJson("/api/votes/candidates", voter),
    );
    expect(candidates.map((candidate) => candidate.id)).toContain(own);

    expect((await putVotes(voter, [own])).status).toBe(400);
    expect((await putVotes(voter, [other, other])).status).toBe(400);
    expect((await putVotes(voter, [other, own])).status).toBe(400);
    expect((await putVotes(voter, [other + 1000])).status).toBe(400);

    try {
      await setDay(2);
      expect((await putVotes(voter, [other])).status).toBe(400);
    } finally {
      await setDay(1);
    }

    expect(ballotSchema.parse(await getJson("/api/votes/mine", voter))).toEqual(
      { photoIds: [] },
    );
  });

  it("refuses more picks than there are ranks", async () => {
    const voter = await signIn("voter");
    const ids = [
      await uploadPhotoId(await signIn()),
      await uploadPhotoId(await signIn("rival")),
    ];
    expect((await putVotes(voter, [...ids, ...ids])).status).toBe(400);
  });

  it("closes voting the moment the live event starts", async () => {
    const voter = await signIn("voter");
    const id = await uploadPhotoId(await signIn());
    expect((await setPhase(voter, "countdown")).status).toBe(200);

    const res = await putVotes(voter, [id]);
    expect(res.status).toBe(409);
    expect(ballotSchema.parse(await getJson("/api/votes/mine", voter))).toEqual(
      { photoIds: [] },
    );
  });

  it("tells everyone connected that a ballot moved", async () => {
    const voter = await signIn("voter");
    const id = await uploadPhotoId(await signIn());
    const socket = await openSocket();

    expect((await putVotes(voter, [id])).status).toBe(200);
    expect(await socket.next()).toEqual({ type: "votes_changed", day: 1 });
  });

  it("keeps the whole ballot behind the session cookie", async () => {
    const voter = await signIn("voter");
    const id = await uploadPhotoId(await signIn());
    expect((await putVotes(voter, [id])).status).toBe(200);

    for (const path of ["/api/votes/candidates", "/api/votes/mine"]) {
      expect((await app.request(path, {}, env)).status).toBe(401);
    }
    const res = await app.request(
      "/api/votes",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: [id] }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});
