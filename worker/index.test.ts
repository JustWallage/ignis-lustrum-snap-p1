import {
  createExecutionContext,
  runInDurableObject,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  apiErrorSchema,
  avatarStateSchema,
  commentListSchema,
  dayResultsSchema,
  evaluationRetrySchema,
  failedEvaluationsSchema,
  likeResultSchema,
  meSchema,
  mySubmissionSchema,
  photoSchema,
} from "../shared/api";
import { eventStateSchema } from "../shared/events";
import { juryForDay } from "../shared/juries";
import { HALF_WEIGHT } from "../shared/scoring";
import { gameStateSchema } from "../shared/state";
import {
  wsEventSchema,
  type WsEvent,
  type WsEventType,
} from "../shared/ws-events";
import { app } from "./index";
import { SESSION_TTL_SECONDS, verifyJWT } from "./lib/auth";
import {
  AVATAR_DAILY_LIMIT,
  AVATAR_GLOBAL_DAILY_LIMIT,
} from "./lib/avatar-caps";
import { bytesToBase64 } from "./lib/bytes";
import {
  AVATAR_IMAGE_SIZE,
  AVATAR_INSTRUCTIONS,
  GEMINI_IMAGE_MODEL,
  GEMINI_MODEL,
} from "./lib/gemini";
import { readSocketState } from "./lib/presence";
import { IDLE_EVENT } from "./test-helpers";

const PASSWORDS: Record<string, string> = {
  tester: "test-password-123",
  rival: "rival-password-123",
  voter: "voter-password-123",
};

async function signIn(name = "tester"): Promise<string> {
  await app.request("/api/seed", { method: "POST" }, env);
  const res = await app.request(
    "/api/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password: PASSWORDS[name] }),
    },
    env,
  );
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie");
  if (setCookie === null) throw new Error("no session cookie");
  return setCookie.split(";")[0] ?? "";
}

// cf-typegen types JWT_SECRET as optional (production supplies it as a secret,
// not a var); the test pool always binds it.
function jwtSecret(): string {
  const secret = env.JWT_SECRET;
  if (secret === undefined) throw new Error("JWT_SECRET is not bound");
  return secret;
}

async function daysLater<T>(days: number, body: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + days * 24 * 60 * 60 * 1000);
  try {
    return await body();
  } finally {
    vi.useRealTimers();
  }
}

async function setPhase(cookie: string, phase: string): Promise<Response> {
  return app.request(
    "/api/test/phase",
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
    },
    env,
  );
}

const PHOTO_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10]);

function photoForm(options: { caption?: string; replace?: boolean }): FormData {
  const form = new FormData();
  form.append("photo", new File([PHOTO_BYTES], "x.png", { type: "image/png" }));
  if (options.caption !== undefined) form.append("caption", options.caption);
  if (options.replace === true) form.append("replace", "1");
  return form;
}

interface UploadOptions {
  caption?: string;
  replace?: boolean;
  bindings?: object;
}

/** A real ExecutionContext, so a test can await the `waitUntil` the route hands the AI
 * evaluation to. `bindings` defaults to the pool's own `env`, which is NOT the same as
 * "no key": wrangler loads a developer's `.env`, so a test that needs one absent says so
 * with `withoutGeminiKey()`. */
async function uploadPhoto(
  cookie: string,
  options: UploadOptions = {},
): Promise<Response> {
  const form = photoForm(options);
  const ctx = createExecutionContext();
  const res = await app.request(
    "/api/photos",
    { method: "POST", body: form, headers: { Cookie: cookie } },
    options.bindings ?? env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function uploadPhotoId(
  cookie: string,
  options: UploadOptions = {},
): Promise<number> {
  const res = await uploadPhoto(cookie, options);
  expect(res.status).toBe(201);
  return photoSchema.parse(await res.json()).id;
}

async function putVotes(cookie: string, photoIds: number[]): Promise<Response> {
  return app.request(
    "/api/votes",
    {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ photoIds }),
    },
    env,
  );
}

async function getJson(path: string, cookie: string): Promise<unknown> {
  const res = await app.request(path, { headers: { Cookie: cookie } }, env);
  expect(res.status).toBe(200);
  return res.json();
}

async function setDay(day: number): Promise<void> {
  await env.DB.prepare("UPDATE game_state SET day = ? WHERE id = 1")
    .bind(day)
    .run();
}

async function storedDay(id: number): Promise<number> {
  const row = await env.DB.prepare("SELECT day FROM photos WHERE id = ?")
    .bind(id)
    .first();
  return z.object({ day: z.int() }).parse(row).day;
}

async function rowsForDay(day: number): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM photos WHERE day = ?",
  )
    .bind(day)
    .first();
  return z.object({ n: z.int() }).parse(row).n;
}

interface TestSocket {
  greeting: WsEvent[];
  next: () => Promise<WsEvent>;
  announce: (standing: { x: number; y: number; facing: string }) => void;
  sendRaw: (message: string) => void;
  seen: () => WsEventType[];
  close: () => void;
}

const openSockets: TestSocket[] = [];

async function openSocket(
  cookie?: string,
  path = "/api/ws",
): Promise<TestSocket> {
  const res = await app.request(
    path,
    {
      headers: {
        Upgrade: "websocket",
        ...(cookie === undefined ? {} : { Cookie: cookie }),
      },
    },
    env,
  );
  expect(res.status).toBe(101);
  const socket = res.webSocket;
  if (socket === null) throw new Error("no websocket on the upgrade response");

  const queued: WsEvent[] = [];
  const waiting: ((event: WsEvent) => void)[] = [];
  socket.addEventListener("message", (message) => {
    if (typeof message.data !== "string") return;
    const event = wsEventSchema.parse(JSON.parse(message.data));
    const resolve = waiting.shift();
    if (resolve === undefined) queued.push(event);
    else resolve(event);
  });
  socket.accept();

  const next = () =>
    new Promise<WsEvent>((resolve) => {
      const ready = queued.shift();
      if (ready === undefined) waiting.push(resolve);
      else resolve(ready);
    });

  // Every socket is greeted, so a test about a later event steps past all of it. The
  // roster is always the LAST frame, which is what makes this survive a new one.
  const greeting: WsEvent[] = [];
  do {
    greeting.push(await next());
  } while (greeting[greeting.length - 1]?.type !== "presence_here");

  const opened: TestSocket = {
    greeting,
    next,
    announce: (standing) => {
      socket.send(JSON.stringify({ type: "presence", ...standing }));
    },
    sendRaw: (message) => {
      socket.send(message);
    },
    seen: () => queued.map((event) => event.type),
    close: () => {
      socket.close();
    },
  };
  openSockets.push(opened);
  return opened;
}

/** Reads the queue rather than awaiting it: a waiter left hanging on a frame that never
 * comes would swallow the next real one. */
async function nothingLike(
  socket: TestSocket,
  type: WsEventType,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(socket.seen()).not.toContain(type);
}

beforeEach(async () => {
  const cookie = await signIn();
  await app.request(
    "/api/test/reset",
    { method: "POST", headers: { Cookie: cookie } },
    env,
  );
});

afterEach(async () => {
  for (const socket of openSockets.splice(0)) {
    socket.close();
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
});

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

describe("auth", () => {
  it("rejects unauthenticated uploads", async () => {
    const res = await app.request("/api/photos", { method: "POST" }, env);
    expect(res.status).toBe(401);
  });

  it("returns the signed-in user from /api/me", async () => {
    const cookie = await signIn();
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    const me = meSchema.parse(await res.json());
    expect(me.user.name).toBe("tester");
    expect(me.isAdmin).toBe(true);
  });

  it("slides a session that is inside its last week onto a fresh 30 days", async () => {
    const cookie = await signIn();
    const { setCookie, remaining } = await daysLater(24, async () => {
      const res = await app.request(
        "/api/me",
        { headers: { Cookie: cookie } },
        env,
      );
      expect(res.status).toBe(200);
      const header = res.headers.get("set-cookie");
      if (header === null) throw new Error("expected a renewed session cookie");

      const renewed = header.split(";")[0]?.slice("token=".length) ?? "";
      expect(renewed).not.toBe(cookie.slice("token=".length));
      const session = await verifyJWT(renewed, jwtSecret());
      if (session === null)
        throw new Error("the renewed token does not verify");
      expect(session.name).toBe("tester");

      return {
        setCookie: header,
        remaining: session.exp - Math.floor(Date.now() / 1000),
      };
    });
    expect(remaining).toBe(SESSION_TTL_SECONDS);
    expect(setCookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
    expect(setCookie).toContain("HttpOnly");
  });

  it("does not re-issue a cookie while the token has plenty of life left", async () => {
    const cookie = await signIn();
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("renews on a route that returns a Response directly", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    const res = await daysLater(24, async () =>
      app.request(
        `/api/photos/${id}/image`,
        { headers: { Cookie: cookie } },
        env,
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(
      `Max-Age=${SESSION_TTL_SECONDS}`,
    );
  });

  it("401s an expired token instead of renewing it", async () => {
    const cookie = await signIn();
    const res = await daysLater(31, async () =>
      app.request("/api/me", { headers: { Cookie: cookie } }, env),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

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
    await expect(
      env.DB.prepare(
        "INSERT INTO photos (user_id, data, content_type, day, created_at)" +
          " SELECT user_id, data, content_type, day, created_at FROM photos",
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

  it("adds and lists a comment", async () => {
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie);
    const created = await app.request(
      `/api/photos/${id}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ body: "nice one" }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const list = await app.request(
      `/api/photos/${id}/comments`,
      { headers: { Cookie: cookie } },
      env,
    );
    const { comments } = commentListSchema.parse(await list.json());
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      body: "nice one",
      author: { name: "tester" },
    });
  });
});

function geminiReply(text: string): Response {
  return Response.json({
    candidates: [{ content: { parts: [{ text }] } }],
  });
}

const VERDICT = {
  score: 9,
  critique: "The light is doing all the work, and it is working.",
  caption: "Low Sun Over A Bad Idea",
  bonusDetected: true,
  bonusReason: "A hot dog, lower left.",
};

function stubGemini(reply: () => Promise<Response> | Response) {
  const mock = vi.fn((_url: string, _init: RequestInit) => reply());
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** BOTH pinned in both helpers, the one they want and the other to `undefined`: wrangler
 * loads a developer's `.env` into local bindings, so on a machine that has a real key
 * absence is not the default and such a test quietly stops testing anything. */
function withGeminiKey(): object {
  return {
    ...env,
    GEMINI_API_KEY: "test-key",
    GEMINI_API_KEY_PAID: "paid-key",
  };
}

function withoutGeminiKey(): object {
  return { ...env, GEMINI_API_KEY: undefined, GEMINI_API_KEY_PAID: undefined };
}

const storedScoreSchema = z.object({
  ai_score: z.int(),
  critique: z.string(),
  caption: z.string().nullable(),
  bonus_detected: z.int(),
  bonus_reason: z.string(),
  ai_status: z.enum(["ok", "failed"]),
});

async function storedScore(photoId: number) {
  const row = await env.DB.prepare(
    "SELECT ai_score, critique, caption, bonus_detected, bonus_reason, ai_status FROM photo_scores WHERE photo_id = ?",
  )
    .bind(photoId)
    .first();
  return row === null ? null : storedScoreSchema.parse(row);
}

async function scoreRowCount(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM photo_scores",
  ).first();
  return z.object({ n: z.int() }).parse(row).n;
}

const geminiRequestSchema = z.object({
  contents: z.array(
    z.object({
      parts: z.array(
        z.object({
          text: z.string().optional(),
          inlineData: z
            .object({ mimeType: z.string(), data: z.string() })
            .optional(),
        }),
      ),
    }),
  ),
  generationConfig: z.object({ responseMimeType: z.string() }),
});

describe("the AI jury", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores an ok verdict from a well-formed reply", async () => {
    const fetched = stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    expect(await storedScore(id)).toEqual({
      ai_score: 9,
      critique: VERDICT.critique,
      caption: VERDICT.caption,
      bonus_detected: 1,
      bonus_reason: VERDICT.bonusReason,
      ai_status: "ok",
    });
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it("asks the one model id, in the day's jury's voice, about the day's photo", async () => {
    const fetched = stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const cookie = await signIn();
    await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    const call = fetched.mock.calls[0];
    if (call === undefined) throw new Error("Gemini was never called");
    const [url, init] = call;
    expect(url).toContain(`/${GEMINI_MODEL}:generateContent`);
    expect(z.record(z.string(), z.string()).parse(init.headers)).toMatchObject({
      "x-goog-api-key": "test-key",
    });

    const body = geminiRequestSchema.parse(
      JSON.parse(z.string().parse(init.body)),
    );
    expect(body.generationConfig.responseMimeType).toBe("application/json");

    const parts = body.contents[0]?.parts ?? [];
    const prompt = parts.map((part) => part.text ?? "").join("");
    const jury = juryForDay(1);
    expect(prompt).toContain(jury.theme);
    expect(prompt).toContain(jury.critiquePersona);
    expect(prompt).toContain(jury.bonusPrompt);
    expect(parts.map((part) => part.inlineData)).toContainEqual({
      mimeType: "image/png",
      data: bytesToBase64(PHOTO_BYTES),
    });
  });

  const BROKEN: [string, () => Promise<Response> | Response][] = [
    ["a 500", () => new Response("upstream is down", { status: 500 })],
    [
      "a timeout",
      // Exactly what the request's AbortSignal.timeout rejects with once it
      // fires; sitting through the real 30 seconds would prove nothing more.
      () =>
        Promise.reject(
          new DOMException("The operation timed out.", "TimeoutError"),
        ),
    ],
    ["malformed JSON", () => geminiReply("{ score: nine, critique")],
    [
      "a reply that is not the envelope we expect",
      () => Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
    ],
  ];

  it.each(BROKEN)("falls back to a failed row on %s", async (_case, reply) => {
    stubGemini(reply);
    const cookie = await signIn();
    const res = await uploadPhoto(cookie, { bindings: withGeminiKey() });

    expect(res.status).toBe(201);
    const id = photoSchema.parse(await res.json()).id;
    const score = await storedScore(id);
    expect(score).toMatchObject({
      ai_score: 5,
      bonus_detected: 0,
      ai_status: "failed",
    });
    expect(score?.critique).toMatch(/broke it/i);
  });

  it("treats a missing GEMINI_API_KEY as a failed call, not a crash", async () => {
    const fetched = stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const cookie = await signIn();
    const res = await uploadPhoto(cookie, { bindings: withoutGeminiKey() });

    expect(res.status).toBe(201);
    const id = photoSchema.parse(await res.json()).id;
    expect(await storedScore(id)).toMatchObject({
      ai_score: 5,
      ai_status: "failed",
    });
    expect(fetched).not.toHaveBeenCalled();
  });

  it("answers the upload before the model does", async () => {
    let answer: (res: Response) => void = () => undefined;
    const thinking = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    stubGemini(() => thinking);

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
    expect(await storedScore(id)).toBeNull();

    answer(geminiReply(JSON.stringify(VERDICT)));
    await waitOnExecutionContext(ctx);
    expect(await storedScore(id)).toMatchObject({ ai_status: "ok" });
  });

  it("drops a verdict with the snap it belongs to", async () => {
    stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const cookie = await signIn();
    const bindings = withGeminiKey();

    const first = await uploadPhotoId(cookie, { bindings });
    const replaced = await uploadPhoto(cookie, { replace: true, bindings });
    expect(replaced.status).toBe(201);
    const second = photoSchema.parse(await replaced.json()).id;

    expect(await storedScore(first)).toBeNull();
    expect(await storedScore(second)).toMatchObject({ ai_status: "ok" });
    expect(await scoreRowCount()).toBe(1);

    const deleted = await app.request(
      `/api/photos/${second}`,
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(deleted.status).toBe(200);
    expect(await scoreRowCount()).toBe(0);
  });

  it("serves the verdict to nobody yet", async () => {
    stubGemini(() => geminiReply(JSON.stringify(VERDICT)));
    const cookie = await signIn();
    const id = await uploadPhotoId(cookie, { bindings: withGeminiKey() });

    const responses = await Promise.all([
      app.request(`/api/photos/${id}`, { headers: { Cookie: cookie } }, env),
      app.request("/api/photos/mine", { headers: { Cookie: cookie } }, env),
      app.request("/api/state", {}, env),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).not.toContain(VERDICT.critique);
      expect(body).not.toContain("critique");
      expect(body).not.toContain("score");
    }
  });
});

describe("day results", () => {
  const RESULTS = "/api/days/1/results";

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

async function failedCount(cookie: string, day?: number): Promise<number> {
  const query = day === undefined ? "" : `?day=${day}`;
  const res = await app.request(
    `/api/admin/evaluate${query}`,
    { headers: { Cookie: cookie } },
    env,
  );
  expect(res.status).toBe(200);
  return failedEvaluationsSchema.parse(await res.json()).failed;
}

async function postRetry(cookie: string, path: string): Promise<Response> {
  return app.request(
    path,
    { method: "POST", headers: { Cookie: cookie } },
    withGeminiKey(),
  );
}

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

describe("live event", () => {
  async function eventAction(
    cookie: string,
    action: "start" | "abort",
    bindings: object = env,
  ): Promise<Response> {
    return app.request(
      `/api/admin/event/${action}`,
      { method: "POST", headers: { Cookie: cookie } },
      bindings,
    );
  }

  function asFriend(): object {
    return { ...env, ADMIN_NAMES: "somebody-else" };
  }

  async function readEvent(): Promise<unknown> {
    const res = await app.request("/api/event", {}, env);
    expect(res.status).toBe(200);
    return eventStateSchema.parse(await res.json());
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

const SPRITE_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

function avatarReply(
  data: string = bytesToBase64(SPRITE_BYTES),
  mimeType = "image/png",
): Response {
  return Response.json({
    candidates: [
      {
        content: {
          parts: [
            { text: "Here is your trainer!" },
            { inlineData: { mimeType, data } },
          ],
        },
      },
    ],
  });
}

async function generateAvatar(
  cookie: string,
  bindings: object = withGeminiKey(),
): Promise<Response> {
  const form = new FormData();
  form.append(
    "photo",
    new File([PHOTO_BYTES], "me.png", { type: "image/png" }),
  );
  return app.request(
    "/api/avatar",
    { method: "POST", body: form, headers: { Cookie: cookie } },
    bindings,
  );
}

async function avatarState(cookie: string) {
  const res = await app.request(
    "/api/avatar",
    { headers: { Cookie: cookie } },
    env,
  );
  expect(res.status).toBe(200);
  return avatarStateSchema.parse(await res.json());
}

async function spendQuota(used: number, who = "tester"): Promise<void> {
  const changed = await env.DB.prepare(
    "INSERT INTO avatar_generations (user_id, day, used, updated_at)" +
      " SELECT id, 1, ?, 0 FROM users WHERE name = ?" +
      " ON CONFLICT (user_id, day) DO UPDATE SET used = excluded.used",
  )
    .bind(used, who)
    .run();
  expect(changed.meta.changes).toBe(1);
}

async function townUsed(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT coalesce(sum(used), 0) AS town FROM avatar_generations WHERE day = 1",
  ).first<{ town: number }>();
  return row?.town ?? 0;
}

async function storedAvatar(): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT avatar FROM users WHERE name = 'tester'",
  ).first();
  return z.object({ avatar: z.string().nullable() }).parse(row).avatar;
}

describe("avatar generation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws a sprite from any photo and stores it on the user row", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();

    expect(await avatarState(cookie)).toEqual({
      avatar: null,
      remaining: AVATAR_DAILY_LIMIT,
      limit: AVATAR_DAILY_LIMIT,
    });

    const res = await generateAvatar(cookie);
    expect(res.status).toBe(201);
    const state = avatarStateSchema.parse(await res.json());
    expect(state.remaining).toBe(AVATAR_DAILY_LIMIT - 1);
    if (state.avatar === null) throw new Error("no sprite came back");
    expect(state.avatar.url).toContain("/api/avatar/image?v=");

    expect(await storedAvatar()).toBe(bytesToBase64(SPRITE_BYTES));
    expect(fetched).toHaveBeenCalledTimes(1);
    expect((await avatarState(cookie)).remaining).toBe(AVATAR_DAILY_LIMIT - 1);
  });

  it("asks the image model, in one call, to personify whatever it is given", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();
    expect((await generateAvatar(cookie)).status).toBe(201);

    const call = fetched.mock.calls[0];
    if (call === undefined) throw new Error("Gemini was never called");
    const [url, init] = call;
    expect(url).toContain(`/${GEMINI_IMAGE_MODEL}:generateContent`);
    expect(url).not.toContain(GEMINI_MODEL);

    const body = z
      .object({
        contents: z.array(
          z.object({
            parts: z.array(
              z.object({
                text: z.string().optional(),
                inlineData: z
                  .object({ mimeType: z.string(), data: z.string() })
                  .optional(),
              }),
            ),
          }),
        ),
        generationConfig: z.object({
          responseModalities: z.array(z.string()),
          imageConfig: z.object({ imageSize: z.string() }),
        }),
      })
      .parse(JSON.parse(z.string().parse(init.body)));

    expect(body.generationConfig.responseModalities).toEqual(["TEXT", "IMAGE"]);
    // The output size is the bill: this model charges per picture by resolution
    // and defaults to 1K, so asking for the smallest tier is a third off every
    // sprite for pixels the draw-time key-out would have thrown away anyway.
    expect(body.generationConfig.imageConfig.imageSize).toBe(AVATAR_IMAGE_SIZE);
    const parts = body.contents[0]?.parts ?? [];
    expect(parts.map((part) => part.text ?? "").join("")).toBe(
      AVATAR_INSTRUCTIONS,
    );
    expect(AVATAR_INSTRUCTIONS).toMatch(/never refuse/i);
    expect(AVATAR_INSTRUCTIONS).toMatch(/personify/i);
    expect(AVATAR_INSTRUCTIONS).toMatch(/#FFFFFF/);
    expect(AVATAR_INSTRUCTIONS).toMatch(/waist/i);
    expect(parts.map((part) => part.inlineData)).toContainEqual({
      mimeType: "image/png",
      data: bytesToBase64(PHOTO_BYTES),
    });
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it("refuses the 11th generation of the day", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();

    expect((await generateAvatar(cookie)).status).toBe(201);
    await spendQuota(AVATAR_DAILY_LIMIT);
    expect((await avatarState(cookie)).remaining).toBe(0);

    const refused = await generateAvatar(cookie);
    expect(refused.status).toBe(429);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(
      /all 10 avatars for today/i,
    );
    expect(fetched).toHaveBeenCalledTimes(1);
    expect((await avatarState(cookie)).remaining).toBe(0);
  });

  it("refuses everybody once the town has spent its 50", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();

    await spendQuota(AVATAR_GLOBAL_DAILY_LIMIT - 1, "rival");
    expect((await avatarState(cookie)).remaining).toBe(1);

    expect((await generateAvatar(cookie)).status).toBe(201);
    expect((await avatarState(cookie)).remaining).toBe(0);

    const refused = await generateAvatar(cookie);
    expect(refused.status).toBe(429);
    expect(apiErrorSchema.parse(await refused.json()).error).toMatch(
      /all 50 avatars the town gets today/i,
    );
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(await townUsed()).toBe(AVATAR_GLOBAL_DAILY_LIMIT);
  });

  it("keeps one quota row per user per day, in the database", async () => {
    stubGemini(() => avatarReply());
    const cookie = await signIn();
    expect((await generateAvatar(cookie)).status).toBe(201);
    // The counter is bumped by an UPSERT rather than read-then-written, and this
    // index is what makes that atomic: two requests racing cannot both spend the
    // last slot.
    await expect(
      env.DB.prepare(
        "INSERT INTO avatar_generations (user_id, day, used, updated_at)" +
          " SELECT user_id, day, used, updated_at FROM avatar_generations",
      ).run(),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("opens a fresh quota on a new contest day", async () => {
    stubGemini(() => avatarReply());
    const cookie = await signIn();
    await spendQuota(AVATAR_DAILY_LIMIT);
    expect((await generateAvatar(cookie)).status).toBe(429);
    try {
      await setDay(2);
      expect((await avatarState(cookie)).remaining).toBe(AVATAR_DAILY_LIMIT);
      expect((await generateAvatar(cookie)).status).toBe(201);
    } finally {
      await setDay(1);
    }
  });

  const BROKEN_DRAWS: [string, () => Promise<Response> | Response, number][] = [
    ["a 500", () => new Response("upstream is down", { status: 500 }), 502],
    [
      "a timeout",
      () =>
        Promise.reject(
          new DOMException("The operation timed out.", "TimeoutError"),
        ),
      502,
    ],
    [
      "a reply with no image in it",
      () =>
        Response.json({
          candidates: [{ content: { parts: [{ text: "no" }] } }],
        }),
      502,
    ],
    [
      "a sprite too big for a D1 value",
      () => avatarReply("A".repeat(2_000_000)),
      502,
    ],
  ];

  it.each(BROKEN_DRAWS)(
    "spends no quota on %s",
    async (_case, reply, status) => {
      stubGemini(reply);
      const cookie = await signIn();

      const res = await generateAvatar(cookie);
      expect(res.status).toBe(status);
      expect(apiErrorSchema.parse(await res.json()).error).not.toBe("");

      expect(await avatarState(cookie)).toEqual({
        avatar: null,
        remaining: AVATAR_DAILY_LIMIT,
        limit: AVATAR_DAILY_LIMIT,
      });
      expect(await storedAvatar()).toBeNull();
    },
  );

  it("treats a missing GEMINI_API_KEY_PAID as offline, not a crash", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();

    const res = await generateAvatar(cookie, withoutGeminiKey());
    expect(res.status).toBe(503);
    expect(apiErrorSchema.parse(await res.json()).error).toMatch(/offline/i);
    expect(fetched).not.toHaveBeenCalled();
    expect((await avatarState(cookie)).remaining).toBe(AVATAR_DAILY_LIMIT);
  });

  it("serves the sprite's bytes to its owner and to nobody else", async () => {
    stubGemini(() => avatarReply());
    const cookie = await signIn();

    const missing = await app.request(
      "/api/avatar/image",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(missing.status).toBe(404);

    expect((await generateAvatar(cookie)).status).toBe(201);
    const res = await app.request(
      "/api/avatar/image",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(SPRITE_BYTES);

    for (const path of ["/api/avatar", "/api/avatar/image"]) {
      expect((await app.request(path, {}, env)).status).toBe(401);
    }
    expect(
      (await app.request("/api/avatar", { method: "POST" }, env)).status,
    ).toBe(401);
  });

  it("discards a sprite without handing the quota back", async () => {
    stubGemini(() => avatarReply());
    const cookie = await signIn();
    expect((await generateAvatar(cookie)).status).toBe(201);

    const res = await app.request(
      "/api/avatar",
      { method: "DELETE", headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(avatarStateSchema.parse(await res.json())).toEqual({
      avatar: null,
      remaining: AVATAR_DAILY_LIMIT - 1,
      limit: AVATAR_DAILY_LIMIT,
    });
    expect(await storedAvatar()).toBeNull();
    expect(
      (
        await app.request(
          "/api/avatar/image",
          { headers: { Cookie: cookie } },
          env,
        )
      ).status,
    ).toBe(404);
  });

  it("refuses a source that is not an image we can send", async () => {
    const fetched = stubGemini(() => avatarReply());
    const cookie = await signIn();
    const form = new FormData();
    form.append("photo", new File(["nope"], "me.txt", { type: "text/plain" }));
    const res = await app.request(
      "/api/avatar",
      { method: "POST", body: form, headers: { Cookie: cookie } },
      withGeminiKey(),
    );
    expect(res.status).toBe(400);
    expect(fetched).not.toHaveBeenCalled();
    expect((await avatarState(cookie)).remaining).toBe(AVATAR_DAILY_LIMIT);
  });
});

describe("presence", () => {
  const AT = { x: 4, y: 4, facing: "down" } as const;

  it("tells everyone else where a player walked, and never tells them", async () => {
    const cookie = await signIn();
    const watcher = await openSocket();
    const walker = await openSocket(cookie);

    walker.announce(AT);
    expect(await watcher.next()).toMatchObject({
      type: "presence_moved",
      player: { name: "tester", ...AT },
    });
    await nothingLike(walker, "presence_moved");
  });

  it("hands a joining client the roster instead of making them wait for a step", async () => {
    const walker = await openSocket(await signIn());
    walker.announce(AT);

    const newcomer = await openSocket();
    expect(newcomer.greeting.at(-1)).toMatchObject({
      type: "presence_here",
      players: [{ name: "tester", ...AT }],
    });
  });

  it("takes a player off every other screen when their tab closes", async () => {
    const watcher = await openSocket();
    const walker = await openSocket(await signIn());
    walker.announce(AT);
    const moved = await watcher.next();
    if (moved.type !== "presence_moved") throw new Error("no move to leave");

    walker.close();
    expect(await watcher.next()).toEqual({
      type: "presence_left",
      id: moved.player.id,
    });
  });

  it("shows an anonymous visitor everyone, and shows them to nobody", async () => {
    const walker = await openSocket(await signIn());
    const spectator = await openSocket();

    walker.announce(AT);
    expect(await spectator.next()).toMatchObject({ type: "presence_moved" });
    spectator.announce({ x: 3, y: 4, facing: "up" });
    await nothingLike(walker, "presence_moved");
  });

  it("refuses to let a socket be a user it is not", async () => {
    const watcher = await openSocket();
    const liar = await openSocket(undefined, "/api/ws?name=tester");
    liar.sendRaw(JSON.stringify({ type: "presence", ...AT, name: "tester" }));
    await nothingLike(watcher, "presence_moved");

    const walker = await openSocket(await signIn(), "/api/ws?name=rival");
    walker.sendRaw(JSON.stringify({ type: "presence", ...AT, name: "rival" }));
    expect(await watcher.next()).toMatchObject({
      type: "presence_moved",
      player: { name: "tester" },
    });
  });

  it("drops a frame that is not a position, without dropping the socket", async () => {
    const watcher = await openSocket();
    const walker = await openSocket(await signIn());

    for (const junk of [
      "not json",
      "{}",
      '{"type":"presence","x":99,"y":0,"facing":"down"}',
    ]) {
      walker.sendRaw(junk);
    }
    await nothingLike(watcher, "presence_moved");

    walker.announce(AT);
    expect(await watcher.next()).toMatchObject({ type: "presence_moved" });
  });

  it("keeps at most one frame per step, so a scripted socket cannot drive the fan-out", async () => {
    const watcher = await openSocket();
    const walker = await openSocket(await signIn());
    walker.announce(AT);
    expect(await watcher.next()).toMatchObject({
      type: "presence_moved",
      player: { x: 4 },
    });

    walker.announce({ x: 5, y: 4, facing: "right" });
    walker.announce({ x: 6, y: 4, facing: "right" });
    await nothingLike(watcher, "presence_moved");

    await new Promise((resolve) => setTimeout(resolve, 200));
    walker.announce({ x: 5, y: 4, facing: "right" });
    expect(await watcher.next()).toMatchObject({
      type: "presence_moved",
      player: { x: 5, facing: "right" },
    });
  });

  it("keeps the roster in the sockets' attachments, where hibernation can find it", async () => {
    const walker = await openSocket(await signIn());
    walker.announce(AT);
    const newcomer = await openSocket();
    expect(newcomer.greeting.at(-1)).toMatchObject({ type: "presence_here" });

    const stub = env.REALTIME_DO.get(env.REALTIME_DO.idFromName("global"));
    const attached = await runInDurableObject(stub, (_instance, state) =>
      state.getWebSockets().map((socket) => readSocketState(socket)),
    );
    const standing = attached.filter((state) => state?.at != null);
    expect(standing).toMatchObject([{ name: "tester", at: AT }]);
    expect(standing[0]?.id).toEqual(expect.stringMatching(/[0-9a-f-]{36}/));
  });
});
