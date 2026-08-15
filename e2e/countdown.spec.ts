import type { Locator, Page } from "@playwright/test";
import { townAvatarsSchema } from "../shared/api";
import { eventStateSchema } from "../shared/events";
import { gameStateSchema } from "../shared/state";
import {
  apiSignIn,
  apiStoreAvatar,
  boxAround,
  encloses,
  expect,
  lcd,
  operate,
  overlaps,
  pressStart,
  recordAudio,
  setPhase,
  test,
  voices,
  type Box,
} from "./fixtures";

const SECONDS = "countdown-seconds";

async function boxesOf(figures: Locator): Promise<Box[]> {
  return Promise.all((await figures.all()).map(boxAround));
}

/** Reads the character's OWN canvas: the box is sized by CSS whether or not anything
 * landed in it, so only its pixels can say a player who never drew is standing there
 * in the default sprite rather than in nothing at all. */
async function painted(figure: Locator): Promise<number> {
  return figure.evaluate((node: HTMLCanvasElement) => {
    const ctx = node.getContext("2d");
    if (ctx === null) throw new Error("a character has no 2d context");
    const { data } = ctx.getImageData(0, 0, node.width, node.height);
    return data.filter((value, at) => at % 4 === 3 && value !== 0).length;
  });
}

function figure(page: Page, who: string): Locator {
  return page.locator(`[data-testid="crowd-character"][data-player="${who}"]`);
}

async function pixelsOf(one: Locator): Promise<string> {
  return one.evaluate((node: HTMLCanvasElement) => node.toDataURL());
}

async function startCountdown(page: Page): Promise<number> {
  await operate(page, "Start event", "Start it");
  await expect(page.getByTestId("event-overlay")).toHaveAttribute(
    "data-phase",
    "countdown",
  );
  const { countdownEndsAt } = eventStateSchema.parse(
    await (await page.request.get("/api/event")).json(),
  );
  if (countdownEndsAt === null) {
    throw new Error("the countdown was started without a target");
  }
  return countdownEndsAt;
}

async function join(page: Page, at?: number) {
  if (at !== undefined) await page.clock.setFixedTime(at);
  await page.goto("/");
  await expect(page.getByTestId("event-overlay")).toHaveAttribute(
    "data-phase",
    "countdown",
  );
}

test("two screens read the same second off one absolute target", async ({
  page,
  browser,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  const endsAt = await startCountdown(page);

  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await apiSignIn(friend, "rival");
  await join(friend);

  for (const screen of [page, friend]) {
    await screen.clock.setFixedTime(endsAt - 7_000);
  }
  await expect(page.getByTestId(SECONDS)).toHaveText("7");
  await expect(friend.getByTestId(SECONDS)).toHaveText("7");

  for (const screen of [friend, page]) {
    await screen.clock.setFixedTime(endsAt - 2_400);
  }
  await expect(friend.getByTestId(SECONDS)).toHaveText("3");
  await expect(page.getByTestId(SECONDS)).toHaveText("3");
  await expect(page.getByTestId("event-overlay")).toContainText(
    "THE JUDGING BEGINS IN",
  );

  await friendContext.close();
});

test("a screen joining at t-3s sees three, not ten", async ({
  page,
  browser,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  const endsAt = await startCountdown(page);

  // Pinned BEFORE the first paint, so what this screen shows is what it worked
  // out from the snapshot it was handed on connect — not a ten it started at and
  // would have counted down from wherever it happened to open.
  const lateContext = await browser.newContext();
  const late = await lateContext.newPage();
  await join(late, endsAt - 3_000);
  await expect(late.getByTestId(SECONDS)).toHaveText("3");

  await expect(late.getByRole("img", { name: "Live event" })).toBeVisible();
  await lateContext.close();
});

test("a screen whose clock has run out waits, rather than advancing itself", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  const endsAt = await startCountdown(page);

  // This screen's clock is PAST the target while the server's is not — the only way to
  // ask the question. The digit stops at zero and the phase does not move.
  await page.clock.setFixedTime(endsAt + 5_000);
  await expect(page.getByTestId(SECONDS)).toHaveText("0");
  await expect(page.getByTestId("event-overlay")).toContainText(
    "THE JURY IS DECIDING",
  );
  await expect(page.getByTestId("event-overlay")).toHaveAttribute(
    "data-phase",
    "countdown",
  );
  await expect(page.getByTestId("game-day")).toBeHidden();
  const state = await page.request.get("/api/state");
  expect(gameStateSchema.parse(await state.json())).toMatchObject({
    day: 1,
    phase: "countdown",
  });
});

test("the digits fall on their own, and tick as they go", async ({ page }) => {
  await recordAudio(page);
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await startCountdown(page);

  const digits = page.getByTestId(SECONDS);
  const opening = Number(await digits.textContent());
  expect(opening).toBeGreaterThan(0);
  expect(opening).toBeLessThanOrEqual(10);

  const before = (await voices(page)).length;
  await expect
    .poll(async () => Number(await digits.textContent()))
    .toBeLessThan(opening);
  await expect
    .poll(async () => (await voices(page)).length, { timeout: 8_000 })
    .toBeGreaterThanOrEqual(before + 3);
});

test("the countdown hands over to the reveal without anyone pressing anything", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await startCountdown(page);

  await expect(page.getByTestId("event-overlay")).toHaveAttribute(
    "data-phase",
    "reveal",
    { timeout: 30_000 },
  );
});

test("the whole town stands under the number, in a group and not a row", async ({
  page,
}) => {
  await apiSignIn(page);
  await apiStoreAvatar(page);
  await page.goto("/");
  await pressStart(page);
  const endsAt = await startCountdown(page);
  // Holds the DIGIT still, so every box below is measured against one number's box.
  // It does NOT hold the phase — the reveal arrives on the DO's broadcast — so the
  // whole measurement has to land inside the countdown's ten real seconds.
  await page.clock.setFixedTime(endsAt - 8_000);

  const town = townAvatarsSchema.parse(
    await (await page.request.get("/api/avatars")).json(),
  );
  expect(town.players.length).toBeGreaterThan(1);
  const figures = page.getByTestId("crowd-character");
  await expect(figures).toHaveCount(town.players.length);
  const undrawn = figure(page, "rival");
  expect(
    await painted(undrawn),
    "an undrawn player is drawn anyway",
  ).toBeGreaterThan(0);
  const boxes = await boxesOf(figures);
  expect(
    new Set(boxes.map((box) => Math.round(box.width))).size,
    "at least two distances from the camera",
  ).toBeGreaterThan(1);
  const behind = boxes.some((one, at) =>
    boxes
      .slice(at + 1)
      .some((later) => later.width > one.width && overlaps(one, later)),
  );
  expect(behind, "somebody stands in front of somebody").toBe(true);

  const screen = await boxAround(lcd(page));
  const digits = await boxAround(page.getByTestId(SECONDS));
  const day = await boxAround(page.locator(".gb-event-day"));
  for (const box of [digits, day, ...boxes]) {
    expect(encloses(screen, box), "on the LCD").toBe(true);
  }
  for (const box of boxes) {
    expect(box.y, "under the number").toBeGreaterThanOrEqual(
      digits.y + digits.height - 1,
    );
    expect(box.y + box.height, "above the day").toBeLessThanOrEqual(day.y + 1);
  }

  // LAST, because it POLLS: the sprite is fetched and keyed out after the character
  // mounts — a figure that never notices that stays in the default sprite forever —
  // and retrying here spends none of the margin the measurements above need.
  await expect
    .poll(async () => pixelsOf(figure(page, "tester")))
    .not.toBe(await pixelsOf(undrawn));
});

test("a countdown with no target counts nothing rather than counting wrong", async ({
  page,
}) => {
  await apiSignIn(page);
  await setPhase(page, "countdown");
  await page.goto("/");
  await expect(page.getByTestId(SECONDS)).toHaveText("-");
});
