import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  prizeListSchema,
  prizeSchema,
  prizesPath,
  type Prize,
  type PrizeSet,
} from "../shared/api";
import { MIN_ENABLED_PRIZES, SEED_PRIZES } from "../shared/prizes";
import { wsEventSchema, type WsEvent } from "../shared/ws-events";
import { app } from "./index";

async function signIn(): Promise<string> {
  await app.request("/api/seed", { method: "POST" }, env);
  const res = await app.request(
    "/api/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "tester", password: "test-password-123" }),
    },
    env,
  );
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function asFriend(): object {
  return { ...env, ADMIN_NAMES: "someone-else" };
}

async function request(
  path: string,
  cookie: string,
  init: RequestInit = {},
  bindings: object = env,
): Promise<Response> {
  const headers: Record<string, string> = { Cookie: cookie };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(path, { ...init, headers }, bindings);
}

function post(
  cookie: string,
  body: object,
  bindings?: object,
  set: PrizeSet = "ordinary",
) {
  return request(
    prizesPath(set),
    cookie,
    { method: "POST", body: JSON.stringify(body) },
    bindings,
  );
}

function patch(cookie: string, id: number, body: object, bindings?: object) {
  return request(
    `/api/prizes/${String(id)}`,
    cookie,
    { method: "PATCH", body: JSON.stringify(body) },
    bindings,
  );
}

async function listPrizes(
  cookie: string,
  set: PrizeSet = "ordinary",
): Promise<Prize[]> {
  const res = await request(prizesPath(set), cookie);
  expect(res.status).toBe(200);
  return prizeListSchema.parse(await res.json()).prizes;
}

async function createPrize(
  cookie: string,
  label: string,
  set: PrizeSet = "ordinary",
): Promise<Prize> {
  const res = await post(cookie, { label }, undefined, set);
  expect(res.status).toBe(201);
  return prizeSchema.parse(await res.json());
}

async function storedPrize(id: number) {
  const row = await env.DB.prepare(
    "SELECT label, enabled FROM prizes WHERE id = ?",
  )
    .bind(id)
    .first();
  return row === null
    ? null
    : z.object({ label: z.string(), enabled: z.int() }).parse(row);
}

async function openSocket(): Promise<{
  greeting: WsEvent[];
  next: () => Promise<WsEvent>;
}> {
  const res = await app.request(
    "/api/ws",
    { headers: { Upgrade: "websocket" } },
    env,
  );
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
  const greeting: WsEvent[] = [];
  do {
    greeting.push(await next());
  } while (greeting[greeting.length - 1]?.type !== "presence_here");
  return { greeting, next };
}

let cookie = "";

beforeEach(async () => {
  cookie = await signIn();
  const reset = await request("/api/test/reset", cookie, { method: "POST" });
  expect(reset.status).toBe(200);
});

describe("the prize list", () => {
  it("ships the seeded wheel, in order, to any signed-in friend", async () => {
    const list = await listPrizes(cookie);
    expect(list.map((prize) => prize.label)).toEqual([...SEED_PRIZES]);
    expect(list.every((prize) => prize.enabled)).toBe(true);
    // The migration's SQL is the other half of SEED_PRIZES and cannot import
    // it; this is what stops the two drifting apart.
    expect(SEED_PRIZES.length).toBeGreaterThanOrEqual(MIN_ENABLED_PRIZES);
  });

  it("is readable by a non-admin, who may still not touch it", async () => {
    const res = await request("/api/prizes", cookie, {}, asFriend());
    expect(res.status).toBe(200);
    expect(prizeListSchema.parse(await res.json()).prizes).toHaveLength(
      SEED_PRIZES.length,
    );
  });

  it("needs a session at all", async () => {
    expect((await app.request("/api/prizes", {}, env)).status).toBe(401);
  });
});

describe("the Bowser prize list", () => {
  it("ships empty, and reads to any signed-in friend exactly as the ordinary one does", async () => {
    expect(await listPrizes(cookie, "bowser")).toEqual([]);
    const asAFriend = await request(
      prizesPath("bowser"),
      cookie,
      {},
      asFriend(),
    );
    expect(asAFriend.status).toBe(200);
    expect(prizeListSchema.parse(await asAFriend.json()).prizes).toEqual([]);
    expect((await app.request(prizesPath("bowser"), {}, env)).status).toBe(401);
  });

  it("refuses every mutation from a non-admin, and changes nothing", async () => {
    const friend = asFriend();
    const mine = await createPrize(cookie, "Bowsers bier", "bowser");

    expect(
      (await post(cookie, { label: "Sneaky prize" }, friend, "bowser")).status,
    ).toBe(403);
    expect(
      (await patch(cookie, mine.id, { label: "Mine" }, friend)).status,
    ).toBe(403);
    const deleted = await request(
      `/api/prizes/${String(mine.id)}`,
      cookie,
      { method: "DELETE" },
      friend,
    );
    expect(deleted.status).toBe(403);

    expect((await listPrizes(cookie, "bowser")).map((p) => p.label)).toEqual([
      "Bowsers bier",
    ]);
  });

  it("is edited independently of the ordinary one, in both directions", async () => {
    const beastly = await createPrize(cookie, "Bowsers bed", "bowser");
    expect(beastly.sortOrder).toBe(0);
    expect((await listPrizes(cookie)).map((p) => p.label)).toEqual([
      ...SEED_PRIZES,
    ]);

    const ordinary = (await listPrizes(cookie))[0];
    if (ordinary === undefined) throw new Error("the wheel seeded empty");
    expect(
      (await patch(cookie, ordinary.id, { label: "Renamed" })).status,
    ).toBe(200);
    expect((await listPrizes(cookie, "bowser")).map((p) => p.label)).toEqual([
      "Bowsers bed",
    ]);

    expect((await patch(cookie, beastly.id, { enabled: false })).status).toBe(
      200,
    );
    expect((await listPrizes(cookie)).every((p) => p.enabled)).toBe(true);
  });

  it("answers the ordinary set to anybody who asks for nothing readable", async () => {
    await createPrize(cookie, "Bowsers bier", "bowser");
    for (const query of ["", "?set=", "?set=nonsense"]) {
      const res = await request(`/api/prizes${query}`, cookie);
      expect(res.status).toBe(200);
      expect(
        prizeListSchema.parse(await res.json()).prizes.map((p) => p.label),
      ).toEqual([...SEED_PRIZES]);
    }
  });
});

describe("prize mutations", () => {
  it("refuses every mutation from a non-admin, and changes nothing", async () => {
    const friend = asFriend();
    const target = (await listPrizes(cookie))[0];
    if (target === undefined) throw new Error("the wheel seeded empty");

    expect((await post(cookie, { label: "Sneaky prize" }, friend)).status).toBe(
      403,
    );
    expect(
      (await patch(cookie, target.id, { label: "Mine" }, friend)).status,
    ).toBe(403);
    const deleted = await request(
      `/api/prizes/${String(target.id)}`,
      cookie,
      { method: "DELETE" },
      friend,
    );
    expect(deleted.status).toBe(403);

    expect((await listPrizes(cookie)).map((p) => p.label)).toEqual([
      ...SEED_PRIZES,
    ]);
  });

  it("adds a prize onto the end of the wheel", async () => {
    const created = await createPrize(cookie, "  Extra pudding  ");
    expect(created.label).toBe("Extra pudding");
    expect(created.enabled).toBe(true);

    const list = await listPrizes(cookie);
    expect(list[list.length - 1]).toEqual(created);
    expect(created.sortOrder).toBe(SEED_PRIZES.length);
  });

  it("refuses a prize with no label", async () => {
    expect((await post(cookie, { label: "   " })).status).toBe(400);
    expect((await post(cookie, {})).status).toBe(400);
    expect(await listPrizes(cookie)).toHaveLength(SEED_PRIZES.length);
  });

  it("keeps a disabled prize as a row while dropping it from the enabled set", async () => {
    const target = (await listPrizes(cookie))[0];
    if (target === undefined) throw new Error("the wheel seeded empty");

    const res = await patch(cookie, target.id, { enabled: false });
    expect(res.status).toBe(200);
    expect(prizeSchema.parse(await res.json()).enabled).toBe(false);

    const list = await listPrizes(cookie);
    expect(list).toHaveLength(SEED_PRIZES.length);
    expect(list.filter((prize) => prize.enabled)).toHaveLength(
      SEED_PRIZES.length - 1,
    );
    expect(await storedPrize(target.id)).toEqual({
      label: target.label,
      enabled: 0,
    });

    expect((await patch(cookie, target.id, { enabled: true })).status).toBe(
      200,
    );
    expect(
      (await listPrizes(cookie)).filter((prize) => prize.enabled),
    ).toHaveLength(SEED_PRIZES.length);
  });

  it("renames one prize and leaves the rest alone", async () => {
    const before = await listPrizes(cookie);
    const target = before[1];
    if (target === undefined) throw new Error("the wheel seeded too short");

    expect(
      (await patch(cookie, target.id, { label: "Nieuwe prijs" })).status,
    ).toBe(200);
    const after = await listPrizes(cookie);
    expect(after.map((prize) => prize.label)).toEqual(
      before.map((prize) =>
        prize.id === target.id ? "Nieuwe prijs" : prize.label,
      ),
    );
  });

  it("reorders on sortOrder, and refuses an empty patch", async () => {
    const before = await listPrizes(cookie);
    const first = before[0];
    const second = before[1];
    if (first === undefined || second === undefined) {
      throw new Error("the wheel seeded too short");
    }
    expect(
      (await patch(cookie, first.id, { sortOrder: second.sortOrder })).status,
    ).toBe(200);
    expect(
      (await patch(cookie, second.id, { sortOrder: first.sortOrder })).status,
    ).toBe(200);
    const after = await listPrizes(cookie);
    expect(after.map((prize) => prize.id).slice(0, 2)).toEqual([
      second.id,
      first.id,
    ]);

    expect((await patch(cookie, first.id, {})).status).toBe(400);
  });

  it("deletes a prize, and 404s the second time", async () => {
    const target = await createPrize(cookie, "Doomed prize");
    const path = `/api/prizes/${String(target.id)}`;
    expect((await request(path, cookie, { method: "DELETE" })).status).toBe(
      200,
    );
    expect(await storedPrize(target.id)).toBeNull();
    expect((await request(path, cookie, { method: "DELETE" })).status).toBe(
      404,
    );
    expect((await patch(cookie, target.id, { label: "Ghost" })).status).toBe(
      404,
    );
  });

  it("tells everyone connected that the list moved", async () => {
    const socket = await openSocket();
    expect(socket.greeting).toMatchObject([
      { type: "state_changed" },
      { type: "event_changed" },
      { type: "presence_here" },
    ]);
    await createPrize(cookie, "Broadcast prize");
    expect(await socket.next()).toEqual({ type: "prizes_changed" });
  });
});
