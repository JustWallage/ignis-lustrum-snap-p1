import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { juryForDay } from "../../shared/juries";
import { gameStateSchema } from "../../shared/state";
import { app } from "../index";
import {
  IDLE_EVENT,
  openSocket,
  patchAvatarCaps,
  resetWorld,
  setDay,
  setPhase,
  signIn,
  uploadPhotoId,
} from "../test-helpers";

beforeEach(resetWorld);

describe("game state", () => {
  it("serves the day and phase publicly, with no cookie", async () => {
    const res = await app.request("/api/state", {}, env);
    expect(res.status).toBe(200);
    expect(gameStateSchema.parse(await res.json())).toEqual({
      day: 1,
      phase: "submission",
      submissionCount: 0,
    });
  });

  // Half the entire public read surface, so a cap arriving here would be a money
  // decision handed to anybody who can load the town.
  it("carries no avatar cap, whatever an admin has set them to", async () => {
    const cookie = await signIn();
    expect(
      (await patchAvatarCaps(cookie, { limit: 3, townLimit: 7 })).status,
    ).toBe(200);
    const body = await (await app.request("/api/state", {}, env)).text();
    expect(gameStateSchema.parse(JSON.parse(body))).toEqual({
      day: 1,
      phase: "submission",
      submissionCount: 0,
    });
    expect(body).not.toMatch(/limit/i);
  });

  it("moves the clock for a spec that needs a later day", async () => {
    const cookie = await signIn();
    const moved = await app.request(
      "/api/test/reset",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ day: 4 }),
      },
      env,
    );
    expect(moved.status).toBe(200);
    const res = await app.request("/api/state", {}, env);
    const state = gameStateSchema.parse(await res.json());
    expect(state).toEqual({ day: 4, phase: "submission", submissionCount: 0 });
    expect(juryForDay(state.day).name).not.toBe(juryForDay(1).name);
  });

  it("counts the day's submissions", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    const res = await app.request("/api/state", {}, env);
    expect(gameStateSchema.parse(await res.json()).submissionCount).toBe(1);
  });

  it("counts only the current day's submissions", async () => {
    const cookie = await signIn();
    await uploadPhotoId(cookie);
    try {
      await setDay(2);
      const before = await app.request("/api/state", {}, env);
      expect(gameStateSchema.parse(await before.json())).toMatchObject({
        day: 2,
        submissionCount: 0,
      });

      await uploadPhotoId(cookie);
      const after = await app.request("/api/state", {}, env);
      expect(gameStateSchema.parse(await after.json()).submissionCount).toBe(1);
    } finally {
      await setDay(1);
    }
  });

  it("replays the current state to a socket the moment it connects", async () => {
    const socket = await openSocket();
    expect(socket.greeting).toEqual([
      {
        type: "state_changed",
        state: { day: 1, phase: "submission", submissionCount: 0 },
      },
      { type: "event_changed", state: { ...IDLE_EVENT, day: 1 } },
      { type: "presence_here", players: [] },
    ]);
  });

  it("pushes the new count to clients that were already connected", async () => {
    const socket = await openSocket();

    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);

    const events = [await socket.next(), await socket.next()];
    expect(events).toContainEqual({ type: "photo_created", id });
    expect(events).toContainEqual({
      type: "state_changed",
      state: { day: 1, phase: "submission", submissionCount: 1 },
    });
  });

  it("moves the phase and pushes it to everyone connected", async () => {
    const cookie = await signIn();
    const socket = await openSocket();

    const res = await setPhase(cookie, "countdown");
    expect(res.status).toBe(200);
    expect(gameStateSchema.parse(await res.json()).phase).toBe("countdown");
    const frames = [await socket.next(), await socket.next()];
    expect(frames).toContainEqual({
      type: "state_changed",
      state: { day: 1, phase: "countdown", submissionCount: 0 },
    });

    const publicState = await app.request("/api/state", {}, env);
    expect(gameStateSchema.parse(await publicState.json()).phase).toBe(
      "countdown",
    );
  });

  it("refuses a phase that is not in the schema", async () => {
    const cookie = await signIn();
    expect((await setPhase(cookie, "party")).status).toBe(400);
    const res = await app.request("/api/state", {}, env);
    expect(gameStateSchema.parse(await res.json()).phase).toBe("submission");
  });

  it("winds the clock back to submission on reset", async () => {
    const cookie = await signIn();
    expect((await setPhase(cookie, "wheel")).status).toBe(200);
    await app.request(
      "/api/test/reset",
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    const res = await app.request("/api/state", {}, env);
    expect(gameStateSchema.parse(await res.json())).toEqual({
      day: 1,
      phase: "submission",
      submissionCount: 0,
    });
  });
});
