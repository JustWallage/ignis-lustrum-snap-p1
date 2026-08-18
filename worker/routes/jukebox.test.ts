import { beforeEach, describe, expect, it } from "vitest";
import { jukeboxStateSchema, RECORD_MAX_MS } from "../../shared/jukebox";
import {
  A_RECORD,
  putRecord,
  resetWorld,
  signIn,
  stopRecord,
} from "../test-helpers";

beforeEach(resetWorld);

describe("POST /api/jukebox", () => {
  it("refuses an anonymous visitor: listening is public, pressing is not", async () => {
    expect((await putRecord(A_RECORD)).status).toBe(401);
    expect((await stopRecord()).status).toBe(401);
  });

  it("lets a signed-in friend put a record on and answers the shared state", async () => {
    const res = await putRecord(A_RECORD, await signIn("tester"));
    expect(res.status).toBe(200);
    const state = jukeboxStateSchema.parse(await res.json());
    expect(state.playing?.trackId).toBe(A_RECORD.trackId);
    expect(state.playing?.endsAt).toBe(
      (state.playing?.startedAt ?? 0) + A_RECORD.durationMs,
    );
  });

  it("answers silence when a friend stops it", async () => {
    const cookie = await signIn("rival");
    expect((await putRecord(A_RECORD, cookie)).status).toBe(200);
    const res = await stopRecord(await signIn("tester"));
    expect(res.status).toBe(200);
    expect(jukeboxStateSchema.parse(await res.json())).toEqual({
      playing: null,
    });
  });

  it("refuses a duration past the ceiling and an unbounded id", async () => {
    const cookie = await signIn("tester");
    for (const press of [
      { trackId: A_RECORD.trackId, durationMs: RECORD_MAX_MS + 1 },
      { trackId: "x".repeat(200), durationMs: 1000 },
      { trackId: A_RECORD.trackId },
      null,
    ]) {
      const res = await putRecord(press, cookie);
      expect(res.status, JSON.stringify(press)).toBe(400);
    }
  });
});
