import {
  test as base,
  expect,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { avatarStateSchema, MAX_PICKS, photoSchema } from "../shared/api";
import { eventStateSchema } from "../shared/events";
import { juryForDay } from "../shared/juries";
import {
  ARTIST,
  MAP_H,
  MAP_W,
  NEIGHBOUR,
  SHELF,
  SPAWN,
  TROPHY,
  VOTING,
  type Point,
} from "../shared/map";

let seeded = false;

async function seedUsers(page: Page): Promise<void> {
  if (seeded) return;
  await expect
    .poll(async () => (await page.request.post("/api/seed")).status(), {
      timeout: 30_000,
    })
    .toBe(200);
  seeded = true;
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await seedUsers(page);
    await apiSignIn(page);
    // Polled for the same reason the seed above is: a reset that arrives too early is
    // a cold start read as a failing test.
    await expect
      .poll(async () => (await page.request.post("/api/test/reset")).status(), {
        timeout: 30_000,
      })
      .toBe(200);
    await page.context().clearCookies();
    await use(page);
  },
});

export { expect } from "@playwright/test";

export const TODAY = juryForDay(1);

export async function pressStart(page: Page): Promise<void> {
  await page.getByTestId("start-button").click();
  await expect(page.getByRole("img", { name: "Overworld" })).toBeVisible();
}

export async function walk(
  page: Page,
  key: string,
  x: number,
  y: number,
): Promise<void> {
  await page.keyboard.press(key);
  const pos = page.getByTestId("player-pos");
  await expect(pos).toHaveAttribute("data-x", String(x));
  await expect(pos).toHaveAttribute("data-y", String(y));
}

export async function walkToJury(page: Page): Promise<void> {
  await walk(page, "ArrowRight", SPAWN.x + 1, SPAWN.y);
  await walk(page, "ArrowRight", SPAWN.x + 2, SPAWN.y);
}

export async function walkToVotingNpc(page: Page): Promise<void> {
  await walk(page, "ArrowLeft", SPAWN.x - 1, SPAWN.y);
  await walk(page, "ArrowLeft", VOTING.x + 1, SPAWN.y);
  await walk(page, "ArrowDown", VOTING.x + 1, SPAWN.y + 1);
  await walk(page, "ArrowDown", VOTING.x + 1, VOTING.y);
  // Their tile is solid, so this last press BUMPS: it turns the player without moving
  // them. The position therefore says nothing about whether the turn landed — the A
  // prompt appearing is what does, and pressing A before it is what makes this flaky.
  await walk(page, "ArrowLeft", VOTING.x + 1, VOTING.y);
  await expect(
    page.getByText(/rank today's snaps|sign in to vote/i),
  ).toBeVisible();
}

export async function walkToNeighbour(page: Page): Promise<void> {
  await walk(page, "ArrowRight", NEIGHBOUR.x, SPAWN.y);
  await walk(page, "ArrowDown", NEIGHBOUR.x, SPAWN.y + 1);
  await walk(page, "ArrowDown", NEIGHBOUR.x, NEIGHBOUR.y - 1);
  await walk(page, "ArrowDown", NEIGHBOUR.x, NEIGHBOUR.y - 1);
  await expect(
    page.getByText(/talk to chris|sign in to talk to chris/i),
  ).toBeVisible();
}

export async function walkToArtist(page: Page): Promise<void> {
  await walk(page, "ArrowRight", SPAWN.x + 1, SPAWN.y);
  await walk(page, "ArrowDown", SPAWN.x + 1, SPAWN.y + 1);
  await walk(page, "ArrowDown", SPAWN.x + 1, SPAWN.y + 2);
  await walk(page, "ArrowRight", SPAWN.x + 2, SPAWN.y + 2);
  await walk(page, "ArrowDown", SPAWN.x + 2, ARTIST.y);
  await walk(page, "ArrowRight", ARTIST.x - 1, ARTIST.y);
  await walk(page, "ArrowRight", ARTIST.x - 1, ARTIST.y);
  await expect(
    page.getByText(/have your avatar drawn|sign in for an avatar/i),
  ).toBeVisible();
}

export async function walkToTrophy(page: Page): Promise<void> {
  await walk(page, "ArrowLeft", SPAWN.x - 1, SPAWN.y);
  await walk(page, "ArrowLeft", SPAWN.x - 2, SPAWN.y);
  await walk(page, "ArrowUp", TROPHY.x + 1, TROPHY.y + 1);
  await walk(page, "ArrowLeft", TROPHY.x, TROPHY.y + 1);
  await walk(page, "ArrowUp", TROPHY.x, TROPHY.y + 1);
  await expect(
    page.getByText(/look at the trophy|sign in to see the champion/i),
  ).toBeVisible();
}

export async function walkToShelf(page: Page): Promise<void> {
  await walk(page, "ArrowLeft", SPAWN.x - 1, SPAWN.y);
  await walk(page, "ArrowLeft", SPAWN.x - 2, SPAWN.y);
  await walk(page, "ArrowUp", SHELF.x - 1, SHELF.y + 1);
  await walk(page, "ArrowUp", SHELF.x - 1, SHELF.y);
  await walk(page, "ArrowRight", SHELF.x - 1, SHELF.y);
  await expect(
    page.getByText(/read the archive|sign in to read the archive/i),
  ).toBeVisible();
}

export async function openBallot(page: Page) {
  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);
  await choices.getByRole("button", { name: "View photos" }).click();
  const dialog = page.locator(".gb-window");
  await expect(dialog.getByRole("heading", { name: "Vote" })).toBeVisible();
  return dialog;
}

export interface PickedFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export async function handSnapToJury(
  page: Page,
  file: PickedFile,
): Promise<void> {
  await walkToJury(page);
  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);
  await choices.getByRole("button", { name: "Upload photo" }).click();
  await page.getByTestId("snap-file").setInputFiles(file);
}

export async function openArchive(page: Page) {
  await page.keyboard.press("Enter");
  const archive = page.getByTestId("archive");
  await expect(archive.getByRole("heading", { name: "Archive" })).toBeVisible();
  return archive;
}

export async function filterBy(
  page: Page,
  rail: "archive-days" | "archive-people",
  chip: string,
): Promise<void> {
  await page.getByTestId(rail).getByRole("button", { name: chip }).click();
}

/** Playwright calls anything with a box "visible", an element clipped by
 * `overflow: hidden` included — so a claim about size is a claim about the box. */
export async function boxOf(page: Page, testId: string) {
  const box = await page.getByTestId(testId).first().boundingBox();
  if (box === null) throw new Error(`${testId} is not on screen`);
  return box;
}

/** The big viewer's tap zones: left half back, right half on, over the photograph only. */
export async function tapViewer(
  page: Page,
  side: "back" | "on",
): Promise<void> {
  await page.getByTestId(`viewer-tap-${side}`).click();
}

export async function openSnapViewer(page: Page, nth: number) {
  await page
    .getByTestId("vote-candidates")
    .getByRole("button", { name: `Snap ${nth}`, exact: true })
    .click();
  const viewer = page.locator(".gb-window");
  await expect(viewer.getByTestId("podium")).toBeVisible();
  return viewer;
}

export async function rankCurrent(page: Page, rank: 1 | 2 | 3): Promise<void> {
  const labels = { 1: "1ST", 2: "2ND", 3: "3RD" } as const;
  const put = page.waitForResponse(
    (res) =>
      res.request().method() === "PUT" && res.url().includes("/api/votes"),
  );
  await page.getByRole("button", { name: `Rank ${labels[rank]}` }).click();
  expect((await put).ok()).toBeTruthy();
  await expect(page.getByTestId("vote-save")).toHaveText("SAVED");
}

export async function readDialogue(page: Page) {
  const choices = page.getByTestId("dialogue-choices");
  for (let press = 0; press < 10 && !(await choices.isVisible()); press += 1) {
    await page.keyboard.press("Enter");
  }
  await expect(choices).toBeVisible();
  return choices;
}

/** Shared because BOTH ways of running the machine dry end here — a player's own quota
 * spent, and an admin closing the town's — and the whole point is what does NOT happen:
 * no POST, and no picker opening onto a certain 429. Two copies of that drift. */
export async function expectDrawMeRefused(page: Page): Promise<void> {
  const choices = await readDialogue(page);
  let posted = false;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/avatar")) {
      posted = true;
    }
  });
  await choices.getByRole("button", { name: "Draw me" }).click();
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /all the ink i have for today/i,
  );
  expect(posted).toBe(false);
  await expect(page.locator(".gb-window")).toBeHidden();
}

export async function setPhase(page: Page, phase: string): Promise<void> {
  const res = await page.request.post("/api/test/phase", { data: { phase } });
  expect(res.ok()).toBeTruthy();
}

export async function readEvent(page: Page) {
  const res = await page.request.get("/api/event");
  expect(res.ok()).toBeTruthy();
  return eventStateSchema.parse(await res.json());
}

export async function reachPhase(page: Page, phase: string): Promise<void> {
  await expect(page.getByTestId("event-overlay")).toHaveAttribute(
    "data-phase",
    phase,
    { timeout: 60_000 },
  );
}

export async function setDay(page: Page, day: number): Promise<void> {
  const res = await page.request.post("/api/test/day", { data: { day } });
  expect(res.ok()).toBeTruthy();
}

export async function operate(
  page: Page,
  item: string,
  confirm: string,
): Promise<void> {
  await page.getByTestId("select-button").click();
  await page
    .getByTestId("dialogue-choices")
    .getByRole("button", { name: item })
    .click();
  await expect(page.getByTestId("dialogue-text")).toContainText(/event/i);
  const choices = await readDialogue(page);
  await choices.getByRole("button", { name: confirm }).click();
}

export async function reachPodium(page: Page, place: string): Promise<void> {
  await reachPhase(page, "reveal");
  await expect(page.getByTestId("podium-place")).toHaveText(`${place} PLACE`, {
    timeout: 60_000,
  });
}

export async function reachScoreboard(page: Page): Promise<void> {
  await reachPhase(page, "reveal");
  await expect(page.getByTestId("scoreboard")).toBeVisible({
    timeout: 60_000,
  });
}

export async function hostNext(page: Page): Promise<void> {
  await page.getByTestId("podium-next").click();
  const choices = await readDialogue(page);
  await choices.getByRole("button", { name: "Next place" }).click();
}

export async function walkPodiumToWheel(page: Page): Promise<void> {
  await reachPhase(page, "reveal");
  const next = page.getByTestId("podium-next");
  await expect(next).toBeVisible({ timeout: 60_000 });
  for (let step = 0; step < MAX_PICKS + 2; step += 1) {
    const before = await readEvent(page);
    if (before.phase !== "reveal") break;
    await expect(next).toBeVisible({ timeout: 30_000 });
    await hostNext(page);
    // Wait for the page to LAND, read off the AUTHORITY. Waiting for the build-up line
    // to disappear looks equivalent and is not: it has not appeared yet in the beat
    // after the click, so the second press hits the same stage and the DO 409s.
    await expect
      .poll(
        async () => {
          const now = await readEvent(page);
          return now.phase !== "reveal" || now.podiumRank !== before.podiumRank;
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  }
  await reachPhase(page, "wheel");
}

export const USERS = {
  tester: "test-password-123",
  rival: "rival-password-123",
  voter: "voter-password-123",
  judge: "judge-password-123",
} as const;

export async function apiSignIn(
  page: Page,
  name: keyof typeof USERS = "tester",
): Promise<void> {
  const login = await page.request.post("/api/login", {
    data: { name, password: USERS[name] },
  });
  expect(login.ok()).toBeTruthy();
}

export async function apiUpload(
  page: Page,
  name: keyof typeof USERS,
): Promise<number> {
  await apiSignIn(page, name);
  const res = await page.request.post("/api/photos", {
    multipart: {
      photo: { name: "snap.png", mimeType: "image/png", buffer: TINY_PNG },
    },
  });
  expect(res.status()).toBe(201);
  return photoSchema.parse(await res.json()).id;
}

export async function apiStoreAvatar(
  page: Page,
  sprite: Buffer = AVATAR_PNG,
): Promise<void> {
  const res = await page.request.post("/api/test/avatar", {
    multipart: {
      sprite: { name: "sprite.png", mimeType: "image/png", buffer: sprite },
    },
  });
  expect(res.ok()).toBeTruthy();
}

export async function apiSpendQuota(page: Page, used: number): Promise<void> {
  const res = await page.request.post("/api/test/quota", { data: { used } });
  expect(res.ok()).toBeTruthy();
}

export async function dailyLimit(page: Page): Promise<number> {
  const res = await page.request.get("/api/avatar");
  expect(res.ok()).toBeTruthy();
  return avatarStateSchema.parse(await res.json()).limit;
}

async function samplePixels(
  page: Page,
  points: { x: number; y: number }[],
): Promise<number[][]> {
  return page.evaluate(
    async ({ points, cols, rows }) => {
      // The LCD is painted in a rAF loop off refs assigned during render, so a DOM
      // assertion resolves one frame BEFORE the pixels follow. The draw callback is
      // already queued, so sampling after the next frame closes the gap.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      const canvas = document.querySelector("canvas");
      if (canvas === null) throw new Error("the LCD canvas is missing");
      const ctx = canvas.getContext("2d");
      if (ctx === null) throw new Error("the LCD has no 2d context");
      return points.map((point) => {
        const { data } = ctx.getImageData(
          Math.floor((point.x * canvas.width) / cols),
          Math.floor((point.y * canvas.height) / rows),
          1,
          1,
        );
        return Array.from(data).slice(0, 3);
      });
    },
    { points, cols: MAP_W, rows: MAP_H },
  );
}

export async function pixelAtPoint(
  page: Page,
  x: number,
  y: number,
): Promise<number[]> {
  const [pixel] = await samplePixels(page, [{ x, y }]);
  if (pixel === undefined) throw new Error("no pixel came back from the LCD");
  return pixel;
}

export async function pixelAt(
  page: Page,
  tx: number,
  ty: number,
): Promise<number[]> {
  return pixelAtPoint(page, tx + 0.5, ty + 0.5);
}

export function lcd(page: Page): Locator {
  return page.locator("canvas");
}

export async function joinAs(
  browser: Browser,
  name: keyof typeof USERS,
  options: { wearing?: Buffer; recording?: boolean } = {},
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await apiSignIn(page, name);
  if (options.wearing !== undefined) {
    await apiStoreAvatar(page, options.wearing);
  }
  if (options.recording === true) await recordAudio(page);
  await page.goto("/");
  await page.getByTestId("start-button").click();
  await expect(page.getByTestId("player-name")).toHaveText(name);
  return page;
}

/** Down the sprite's CENTRE column: one pixel is not enough (two judges can share a
 * centre colour), and the centre column never falls through to animating terrain. */
export async function spriteAt(
  page: Page,
  tx: number,
  ty: number,
): Promise<number[][]> {
  return samplePixels(
    page,
    [0.2, 0.35, 0.5, 0.65, 0.8].map((dy) => ({ x: tx + 0.5, y: ty + dy })),
  );
}

declare global {
  interface Window {
    __ignisSockets?: WebSocket[];
  }
}

/** Installs the recorder. Must run before the page navigates. */
export async function recordSockets(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sockets: WebSocket[] = [];
    window.__ignisSockets = sockets;
    const Real = window.WebSocket;
    class Watched extends Real {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        sockets.push(this);
      }
    }
    window.WebSocket = Watched;
  });
}

export async function dropSocket(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sockets = window.__ignisSockets;
    if (sockets === undefined) {
      throw new Error("the socket recorder never installed");
    }
    sockets[sockets.length - 1]?.close();
  });
  await page.waitForTimeout(500);
}

interface AudioLog {
  contexts: number;
  voices: string[];
}

declare global {
  interface Window {
    __ignisAudio?: AudioLog;
  }
}

/** Installs the recorder. Must run before the page navigates. */
export async function recordAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const voices: string[] = [];
    const log = { contexts: 0, voices };
    window.__ignisAudio = log;

    const Real = window.AudioContext;
    class Recording extends Real {
      constructor(options?: AudioContextOptions) {
        super(options);
        log.contexts += 1;
      }
      override createOscillator(): OscillatorNode {
        const osc = super.createOscillator();
        const start = osc.start.bind(osc);
        // Recorded on start, not creation: the wave shape is assigned in between.
        osc.start = (when?: number) => {
          voices.push(osc.type);
          start(when);
        };
        return osc;
      }
      override createBufferSource(): AudioBufferSourceNode {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (when?: number) => {
          voices.push("noise");
          start(when);
        };
        return source;
      }
    }
    window.AudioContext = Recording;
  });
}

export async function audioLog(page: Page): Promise<AudioLog> {
  return page.evaluate(() => {
    const log = window.__ignisAudio;
    if (log === undefined)
      throw new Error("the audio recorder never installed");
    return log;
  });
}

export async function voices(page: Page): Promise<string[]> {
  return (await audioLog(page)).voices;
}

/** Counts every square-wave cue, which across a transmission means the squelch and
 * nothing else: a PCM chunk is a `createBufferSource`, which the recorder logs as
 * "noise" exactly like a noise `Note`, so the specs read deltas around a hold. */
export async function chirps(page: Page): Promise<number> {
  return (await voices(page)).filter((wave) => wave === "square").length;
}

export async function heard(
  page: Page,
  before: number,
  count: number,
): Promise<string[]> {
  await expect
    .poll(async () => (await voices(page)).length)
    .toBe(before + count);
  return (await voices(page)).slice(before);
}

// A spec-correct IDAT stream, because the upload path uses `createImageBitmap`, which
// (unlike `<img>`) rejects truncated encodings.
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGO4ZBP1HwAFtAJoLGl7PAAAAABJRU5ErkJggg==",
  "base64",
);

export const AVATAR_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAI0lEQVR42mP4TyJgoEiDxowJWNGoBvpqmGExAysaShpokloBfGFfP4g7ivEAAAAASUVORK5CYII=",
  "base64",
);

export const AVATAR_SHIRT = [40, 152, 144];

export const AVATAR_TROUSERS = [152, 56, 152];

/** Hardcoded because the palette lives under `src/`, which e2e cannot see. */
export const DEFAULT_TROUSERS = [60, 88, 168];

export function spritePixel(
  tile: Point,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return { x: tile.x + (sx + 2.5) / 16, y: tile.y + (sy + 0.5) / 16 };
}
