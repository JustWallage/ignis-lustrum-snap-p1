import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { apiErrorSchema } from "../../shared/api";
import { eventStateSchema } from "../../shared/events";
import { gameStateSchema } from "../../shared/state";
import { app } from "../index";
import {
  eventAction,
  IDLE_EVENT,
  openSocket,
  readEvent,
  resetWorld,
  setPhase,
  signIn,
  uploadPhoto,
} from "../test-helpers";

beforeEach(resetWorld);

describe("live event", () => {
  function asFriend(): object {
    return { ...env, ADMIN_NAMES: "somebody-else" };
  }

  async function readPhase(): Promise<string> {
    const res = await app.request("/api/state", {}, env);
    return gameStateSchema.parse(await res.json()).phase;
  }

  it("serves the event publicly, with no cookie and no event running", async () => {
    expect(await readEvent()).toEqual({ ...IDLE_EVENT, day: 1 });
  });

  it("keeps the operator's buttons away from everyone else", async () => {
    const cookie = await signIn();
    expect((await eventAction(cookie, "start", asFriend())).status).toBe(403);
    expect((await eventAction(cookie, "abort", asFriend())).status).toBe(403);
    expect(await readPhase()).toBe("submission");
  });

  it("refuses the buttons to a caller with no session at all", async () => {
    const res = await app.request(
      "/api/admin/event/start",
      { method: "POST" },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("starts an event into the countdown and mirrors it into the clock", async () => {
    const cookie = await signIn();
    const before = Date.now();
    const res = await eventAction(cookie, "start");
    expect(res.status).toBe(200);

    const event = eventStateSchema.parse(await res.json());
    expect(event.phase).toBe("countdown");
    expect(event.day).toBe(1);
    expect(event.countdownEndsAt).not.toBeNull();
    expect(event.countdownEndsAt ?? 0).toBeGreaterThan(before);

    expect(await readPhase()).toBe("countdown");
  });

  it("refuses to start a second event over a running one", async () => {
    const cookie = await signIn();
    expect((await eventAction(cookie, "start")).status).toBe(200);

    const again = await eventAction(cookie, "start");
    expect(again.status).toBe(409);
    expect(apiErrorSchema.parse(await again.json()).error).toMatch(
      /already running/i,
    );
    expect(await readPhase()).toBe("countdown");
  });

  it("puts a client that connects mid-event straight into it", async () => {
    const cookie = await signIn();
    expect((await eventAction(cookie, "start")).status).toBe(200);

    const socket = await openSocket();
    expect(socket.greeting).toContainEqual({
      type: "state_changed",
      state: { day: 1, phase: "countdown", submissionCount: 0 },
    });
    expect(socket.greeting).toContainEqual(
      expect.objectContaining({ type: "event_changed" }),
    );
  });

  it("pushes the transition to everyone already connected", async () => {
    const cookie = await signIn();
    const socket = await openSocket();

    expect((await eventAction(cookie, "start")).status).toBe(200);

    const frames = [await socket.next(), await socket.next()];
    expect(frames).toContainEqual(
      expect.objectContaining({ type: "event_changed" }),
    );
    expect(frames).toContainEqual({
      type: "state_changed",
      state: { day: 1, phase: "countdown", submissionCount: 0 },
    });
  });

  it("aborts back to submission with the day unchanged", async () => {
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
    expect((await eventAction(cookie, "start")).status).toBe(200);

    const res = await eventAction(cookie, "abort");
    expect(res.status).toBe(200);
    expect(eventStateSchema.parse(await res.json())).toEqual({
      ...IDLE_EVENT,
      day: 4,
    });
    expect(await readEvent()).toMatchObject({ phase: "submission", day: 4 });

    const state = await app.request("/api/state", {}, env);
    expect(gameStateSchema.parse(await state.json())).toEqual({
      day: 4,
      phase: "submission",
      submissionCount: 0,
    });
  });

  it("refuses an abort when nothing is running", async () => {
    const cookie = await signIn();
    const res = await eventAction(cookie, "abort");
    expect(res.status).toBe(409);
    expect(apiErrorSchema.parse(await res.json()).error).toMatch(/no event/i);
  });

  it("closes the day's field while the event runs, and opens it again", async () => {
    const cookie = await signIn();
    expect((await eventAction(cookie, "start")).status).toBe(200);
    expect((await uploadPhoto(cookie)).status).toBe(409);

    expect((await eventAction(cookie, "abort")).status).toBe(200);
    expect((await uploadPhoto(cookie)).status).toBe(201);
  });

  it("reaches the event phases E2E needs through the DO, not around it", async () => {
    const cookie = await signIn();
    expect((await setPhase(cookie, "reveal")).status).toBe(200);
    expect(await readPhase()).toBe("reveal");
    expect(await readEvent()).toMatchObject({ phase: "reveal", day: 1 });

    expect((await eventAction(cookie, "start")).status).toBe(409);
  });
});
