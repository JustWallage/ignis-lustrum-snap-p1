import type { Browser, Page } from "@playwright/test";
import { SPAWN } from "../shared/map";
import { gameStateSchema } from "../shared/state";
import {
  apiSignIn,
  apiUpload,
  expect,
  operate,
  pressStart,
  readEvent,
  test,
  USERS,
  walkPodiumToWheel,
} from "./fixtures";

const LOOP_TIMEOUT_MS = 240_000;

async function watcher(
  browser: Browser,
  name: keyof typeof USERS,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await apiSignIn(page, name);
  await page.goto("/");
  await pressStart(page);
  return page;
}

async function landTheWheel(page: Page): Promise<string> {
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await walkPodiumToWheel(page);
  await page.getByTestId("wheel-spin").click();
  await expect
    .poll(async () => (await readEvent(page)).prizeIndex)
    .not.toBeNull();
  const spun = await readEvent(page);
  const prize = spun.segments[spun.prizeIndex ?? 0];
  if (prize === undefined) throw new Error("the wheel landed on nothing");
  return prize;
}

test("the last page names the winner, shows their snap, and lets you leave", async ({
  page,
  browser,
}) => {
  test.setTimeout(LOOP_TIMEOUT_MS);
  const friend = await watcher(browser, "rival");
  const prize = await landTheWheel(page);

  for (const screen of [page, friend]) {
    await expect(screen.getByTestId("wheel-prize")).toHaveText(
      prize.toUpperCase(),
      { timeout: 30_000 },
    );
    await expect(screen.getByTestId("wheel-winner-name")).toHaveText("TESTER");
    await expect(screen.getByTestId("wheel-winner-photo")).toBeVisible();
  }

  await page.getByTestId("wheel-winner-photo").click();
  await expect(page.getByTestId("wheel-winner-photo-full")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("wheel-winner-photo-full")).toBeHidden();

  await page.getByTestId("event-done").click();
  await expect(page.getByTestId("event-overlay")).toBeHidden();
  await expect(friend.getByTestId("wheel-prize")).toBeVisible();

  await expect(page.getByRole("img", { name: "Overworld" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("player-pos")).toHaveAttribute(
    "data-x",
    String(SPAWN.x + 1),
  );
  await page.getByTestId("select-button").click();
  await expect(
    page.getByTestId("dialogue-choices").getByRole("button", {
      name: "Abort event",
    }),
  ).toBeVisible();
  await page.keyboard.press("x");

  for (const screen of [page, friend]) {
    await expect(screen.getByTestId("game-day")).toHaveText("DAY 2", {
      timeout: 60_000,
    });
    await expect(screen.getByTestId("event-overlay")).toBeHidden();
  }
  const state = await page.request.get("/api/state");
  expect(gameStateSchema.parse(await state.json())).toMatchObject({
    day: 2,
    phase: "submission",
  });

  await friend.context().close();
});

test("an anonymous walker reads the prize but not the snap behind it", async ({
  page,
  browser,
}) => {
  test.setTimeout(LOOP_TIMEOUT_MS);
  const stranger = await browser.newContext();
  const anonymous = await stranger.newPage();
  const prize = await landTheWheel(page);

  await anonymous.goto("/");
  await expect(anonymous.getByTestId("wheel-prize")).toHaveText(
    prize.toUpperCase(),
    { timeout: 30_000 },
  );
  await expect(anonymous.getByTestId("wheel-winner-photo")).toBeHidden();
  await expect(anonymous.getByTestId("wheel-winner-name")).toBeHidden();
  expect((await anonymous.request.get("/api/days/1/results")).status()).toBe(
    401,
  );

  await stranger.close();
});
