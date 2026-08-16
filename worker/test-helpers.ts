import {
  createExecutionContext,
  runDurableObjectAlarm,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, expect, vi } from "vitest";
import { z } from "zod";
import {
  failedEvaluationsSchema,
  photoSchema,
  prizeListSchema,
  prizesPath,
  type Prize,
  type PrizeSet,
} from "../shared/api";
import {
  eventStateSchema,
  nextDeadline,
  type EventState,
} from "../shared/events";
import type { GamePhase } from "../shared/state";
import {
  wsEventSchema,
  type WsEvent,
  type WsEventType,
} from "../shared/ws-events";
import { app } from "./index";

const PASSWORDS: Record<string, string> = {
  tester: "test-password-123",
  rival: "rival-password-123",
  voter: "voter-password-123",
  judge: "judge-password-123",
};

export async function signIn(name = "tester"): Promise<string> {
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
export function jwtSecret(): string {
  const secret = env.JWT_SECRET;
  if (secret === undefined) throw new Error("JWT_SECRET is not bound");
  return secret;
}

export async function daysLater<T>(
  days: number,
  body: () => Promise<T>,
): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + days * 24 * 60 * 60 * 1000);
  try {
    return await body();
  } finally {
    vi.useRealTimers();
  }
}

export const IDLE_EVENT = {
  phase: "submission",
  countdownEndsAt: null,
  revealStartedAt: null,
  revealPhotoIds: [],
  winnerPhotoId: null,
  winnerUserId: null,
  hostUserId: null,
  podiumRank: null,
  podiumNextAt: null,
  stageEndsAt: null,
  spunAt: null,
  prizeIndex: null,
  segments: [],
  bowser: false,
  beastEndsAt: null,
};

function realtimeStub() {
  const namespace = env.REALTIME_DO;
  return namespace.get(namespace.idFromName("global"));
}

export async function fireEventAlarm(): Promise<boolean> {
  return runDurableObjectAlarm(realtimeStub());
}

/**
 * Fires the next transition instead of waiting the phase out. The clock is moved to the
 * DEADLINE first, because the DO refuses an early alarm — the podium's stages all share
 * the `reveal` phase. `atTheMoment` runs with that clock in place, which is the only
 * way to be a live host at a moment ninety seconds away.
 */
export async function runEventAlarm(
  atTheMoment?: () => Promise<void>,
): Promise<boolean> {
  const deadline = nextDeadline(await readEvent());
  if (deadline === null) {
    await atTheMoment?.();
    return fireEventAlarm();
  }
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(deadline + 1);
  try {
    await atTheMoment?.();
    return await fireEventAlarm();
  } finally {
    vi.useRealTimers();
  }
}

export async function stillWatching(socket: TestSocket): Promise<void> {
  socket.announce({ x: 4, y: 4, facing: "down" });
  await new Promise((resolve) => setTimeout(resolve, 50));
}

export async function playUntil(phase: GamePhase): Promise<EventState> {
  for (let step = 0; step < 10; step += 1) {
    const event = await readEvent();
    if (event.phase === phase) return event;
    expect(await runEventAlarm()).toBe(true);
  }
  throw new Error(`the event never reached ${phase}`);
}

export async function eventAction(
  cookie: string,
  action: "start" | "abort" | "next",
  bindings: object = env,
): Promise<Response> {
  return app.request(
    `/api/admin/event/${action}`,
    { method: "POST", headers: { Cookie: cookie } },
    bindings,
  );
}

export async function readEvent(): Promise<EventState> {
  const res = await app.request("/api/event", {}, env);
  expect(res.status).toBe(200);
  return eventStateSchema.parse(await res.json());
}

export async function postSpin(cookie: string): Promise<Response> {
  return app.request(
    "/api/event/spin",
    { method: "POST", headers: { Cookie: cookie } },
    env,
  );
}

/** The pool pins `ADMIN_NAMES` to `tester`, so a wheel hosted by anybody else needs the
 * binding overridden on the START itself. `judge` hands nothing in, which is what makes a
 * wheel they host the one whose host cannot also be its winner. */
export async function aWheel(host: "tester" | "judge" = "tester") {
  const mine = await signIn("tester");
  const theirs = await signIn("rival");
  const hostCookie = host === "tester" ? mine : await signIn(host);
  const myPhoto = await uploadPhotoId(mine);
  const theirPhoto = await uploadPhotoId(theirs);
  expect((await putVotes(mine, [theirPhoto])).status).toBe(200);
  expect((await putVotes(theirs, [myPhoto])).status).toBe(200);

  expect(
    (await eventAction(hostCookie, "start", { ...env, ADMIN_NAMES: host }))
      .status,
  ).toBe(200);
  const wheel = await playUntil("wheel");
  const winner = wheel.winnerUserId;
  if (winner === null) throw new Error("the wheel came up with no winner");
  const winnerIs = (name: "tester" | "rival") =>
    (name === "tester" ? myPhoto : theirPhoto) === wheel.winnerPhotoId;
  return {
    wheel,
    hostCookie,
    winnerCookie: winnerIs("tester") ? mine : theirs,
    loserCookie: winnerIs("tester") ? theirs : mine,
  };
}

export const BOWSER_PRIZES = ["Bowsers bed", "Bowsers bier"];

export async function markBowserDay(
  cookie: string,
  day: number,
): Promise<Response> {
  return app.request(
    "/api/admin/bowser",
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ day }),
    },
    env,
  );
}

export async function rigDay(
  cookie: string,
  day: number,
  prizeId: number,
): Promise<Response> {
  return app.request(
    "/api/admin/rig",
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ day, prizeId }),
    },
    env,
  );
}

export async function prizeList(
  cookie: string,
  set: PrizeSet = "ordinary",
): Promise<Prize[]> {
  const res = await app.request(
    prizesPath(set),
    { headers: { Cookie: cookie } },
    env,
  );
  expect(res.status).toBe(200);
  return prizeListSchema.parse(await res.json()).prizes;
}

export async function addPrize(
  cookie: string,
  label: string,
  set: PrizeSet,
): Promise<Response> {
  return app.request(
    prizesPath(set),
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    },
    env,
  );
}

/** A wheel on a MARKED day, its Bowser set filled first: the START it goes through
 * refuses a marked day whose own list is short. */
export async function aBowserWheel(host: "tester" | "judge" = "tester") {
  const admin = await signIn("tester");
  expect((await markBowserDay(admin, 1)).status).toBe(200);
  for (const label of BOWSER_PRIZES) {
    expect((await addPrize(admin, label, "bowser")).status).toBe(201);
  }
  return aWheel(host);
}

export async function playToLanding(): Promise<string> {
  const { winnerCookie } = await aWheel();
  expect((await postSpin(winnerCookie)).status).toBe(200);
  const spun = await readEvent();
  expect(await runEventAlarm()).toBe(true);
  const landed = spun.segments[spun.prizeIndex ?? -1];
  if (landed === undefined) throw new Error("the wheel landed on no segment");
  return landed;
}

export async function storedAward(day: number) {
  const row = await env.DB.prepare(
    "SELECT day, user_id, prize_label FROM prize_awards WHERE day = ?",
  )
    .bind(day)
    .first();
  return row === null ? null : storedAwardSchema.parse(row);
}

const storedAwardSchema = z.object({
  day: z.int(),
  user_id: z.int(),
  prize_label: z.string(),
});

export async function currentDay(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT day FROM game_state WHERE id = 1",
  ).first();
  return z.object({ day: z.int() }).parse(row).day;
}

export async function setPhase(
  cookie: string,
  phase: string,
): Promise<Response> {
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

export const PHOTO_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10]);

export const PHOTO_BASE64 = btoa(String.fromCharCode(...PHOTO_BYTES));

export function photoForm(options: {
  caption?: string;
  replace?: boolean;
}): FormData {
  const form = new FormData();
  form.append("photo", new File([PHOTO_BYTES], "x.png", { type: "image/png" }));
  if (options.caption !== undefined) form.append("caption", options.caption);
  if (options.replace === true) form.append("replace", "1");
  return form;
}

export interface UploadOptions {
  caption?: string;
  replace?: boolean;
  bindings?: object;
}

/** A real ExecutionContext, so a test can await the `waitUntil` the route hands the AI
 * evaluation to. `bindings` defaults to the pool's own `env`, which is NOT the same as
 * "no key": wrangler loads a developer's `.env`, so a test that needs one absent says so
 * with `withoutGeminiKey()`. */
export async function uploadPhoto(
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

export async function uploadPhotoId(
  cookie: string,
  options: UploadOptions = {},
): Promise<number> {
  const res = await uploadPhoto(cookie, options);
  expect(res.status).toBe(201);
  return photoSchema.parse(await res.json()).id;
}

export async function putVotes(
  cookie: string,
  photoIds: number[],
): Promise<Response> {
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

export async function getJson(path: string, cookie: string): Promise<unknown> {
  const res = await app.request(path, { headers: { Cookie: cookie } }, env);
  expect(res.status).toBe(200);
  return res.json();
}

export async function setDay(day: number): Promise<void> {
  await env.DB.prepare("UPDATE game_state SET day = ? WHERE id = 1")
    .bind(day)
    .run();
}

export async function storedDay(id: number): Promise<number> {
  const row = await env.DB.prepare("SELECT day FROM photos WHERE id = ?")
    .bind(id)
    .first();
  return z.object({ day: z.int() }).parse(row).day;
}

export async function rowsForDay(day: number): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM photos WHERE day = ?",
  )
    .bind(day)
    .first();
  return z.object({ n: z.int() }).parse(row).n;
}

export interface TestSocket {
  greeting: WsEvent[];
  next: () => Promise<WsEvent>;
  announce: (standing: { x: number; y: number; facing: string }) => void;
  sendRaw: (message: string) => void;
  talk: (open: boolean) => void;
  sendAudio: (bytes: ArrayBuffer) => void;
  heardAudio: () => number;
  seen: () => WsEventType[];
  close: () => void;
}

const openSockets: TestSocket[] = [];

export async function openSocket(
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
  let audio = 0;
  socket.addEventListener("message", (message) => {
    if (typeof message.data !== "string") {
      audio += 1;
      return;
    }
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
    talk: (open) => {
      socket.send(JSON.stringify({ type: open ? "talk_start" : "talk_end" }));
    },
    sendAudio: (bytes) => {
      socket.send(bytes);
    },
    heardAudio: () => audio,
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
export async function nothingLike(
  socket: TestSocket,
  type: WsEventType,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(socket.seen()).not.toContain(type);
}

/** The caps are stored config now, so the ONE way a test moves them is the route an
 * admin moves them by. Takes `unknown` so the refusals can be driven through it too. */
export async function patchAvatarCaps(
  cookie: string,
  caps: unknown,
): Promise<Response> {
  return app.request(
    "/api/admin/avatars",
    {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(caps),
    },
    env,
  );
}

export async function resetWorld(): Promise<void> {
  const cookie = await signIn();
  await app.request(
    "/api/test/reset",
    { method: "POST", headers: { Cookie: cookie } },
    env,
  );
}

afterEach(async () => {
  for (const socket of openSockets.splice(0)) {
    socket.close();
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
});

export function geminiReply(text: string): Response {
  return Response.json({
    candidates: [{ content: { parts: [{ text }] } }],
  });
}

export const VERDICT = {
  score: 9,
  critique: "The light is doing all the work, and it is working.",
  caption: "Low Sun Over A Bad Idea",
  bonusDetected: true,
  bonusReason: "A hot dog, lower left.",
};

export function stubGemini(reply: () => Promise<Response> | Response) {
  const mock = vi.fn((_url: string, _init: RequestInit) => reply());
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Every one of these four pins BOTH variables, the one it wants and the other to
 * `undefined`: wrangler loads a developer's `.env` into local bindings, so absence is
 * never the default and a laptop holding the paid key would make the single-key cases
 * below pass by accident. */
export function withGeminiKey(): object {
  return {
    ...env,
    GEMINI_API_KEY: "test-key",
    GEMINI_API_KEY_PAID: "paid-key",
  };
}

export function withoutGeminiKey(): object {
  return { ...env, GEMINI_API_KEY: undefined, GEMINI_API_KEY_PAID: undefined };
}

/** The jury's key alone: photographs are evaluated, avatars answer "offline". */
export function withJuryKeyOnly(): object {
  return { ...env, GEMINI_API_KEY: "test-key", GEMINI_API_KEY_PAID: undefined };
}

/** The billed key alone: avatars are drawn, the jury takes its failure path. */
export function withAvatarKeyOnly(): object {
  return { ...env, GEMINI_API_KEY: undefined, GEMINI_API_KEY_PAID: "paid-key" };
}

const storedScoreSchema = z.object({
  ai_score: z.int(),
  critique: z.string(),
  caption: z.string().nullable(),
  bonus_detected: z.int(),
  bonus_reason: z.string(),
  ai_status: z.enum(["ok", "failed"]),
});

export async function storedScore(photoId: number) {
  const row = await env.DB.prepare(
    "SELECT ai_score, critique, caption, bonus_detected, bonus_reason, ai_status FROM photo_scores WHERE photo_id = ?",
  )
    .bind(photoId)
    .first();
  return row === null ? null : storedScoreSchema.parse(row);
}

async function rowCount(table: "photos" | "photo_scores"): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT count(*) AS n FROM ${table}`,
  ).first();
  return z.object({ n: z.int() }).parse(row).n;
}

export function scoreRowCount(): Promise<number> {
  return rowCount("photo_scores");
}

export function photoRowCount(): Promise<number> {
  return rowCount("photos");
}

export const geminiRequestSchema = z.object({
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

// No jury key is exactly the shape of a bad Gemini day, so every upload in
// these blocks lands a `failed` row for the retry to find.

export async function failedCount(
  cookie: string,
  day?: number,
): Promise<number> {
  const query = day === undefined ? "" : `?day=${day}`;
  const res = await app.request(
    `/api/admin/evaluate${query}`,
    { headers: { Cookie: cookie } },
    env,
  );
  expect(res.status).toBe(200);
  return failedEvaluationsSchema.parse(await res.json()).failed;
}

export async function postRetry(
  cookie: string,
  path: string,
): Promise<Response> {
  return app.request(
    path,
    { method: "POST", headers: { Cookie: cookie } },
    withGeminiKey(),
  );
}
