import type { Browser, Page } from "@playwright/test";
import { SPAWN } from "../shared/map";
import { gameStateSchema } from "../shared/state";
import {
  apiSignIn,
  expect,
  landTheWheel,
  pressStart,
  test,
  USERS,
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
    const figures = screen.getByTestId("crowd-character");
    await expect(figures).toHaveCount(1);
    await expect(figures).toHaveAttribute("data-player", "tester");
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
  await expect(anonymous.getByTestId("event-results")).toBeHidden();
  expect((await anonymous.request.get("/api/days/1/results")).status()).toBe(
    401,
  );

  await stranger.close();
});

test("View results opens the archive on the day that just played, and the landing leaves it open", async ({
  page,
}) => {
  test.setTimeout(LOOP_TIMEOUT_MS);
  await landTheWheel(page);

  await page.getByTestId("event-results").click();
  const archive = page.getByTestId("archive");
  await expect(archive.getByRole("heading", { name: "Archive" })).toBeVisible();
  // Newest-first, and the day that just played is the newest revealed one — so the
  // archive is already on it with nothing threaded through to say so.
  const cards = archive.getByTestId("archive-card");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Day 1");
  await expect(page.getByTestId("event-overlay")).toBeHidden();

  // The END of an event is the one phase change `eventStageKey` calls no transition at
  // all, which is what leaves the archive standing for the reader who asked for it.
  await expect(page.getByTestId("game-day")).toHaveText("DAY 2", {
    timeout: 60_000,
  });
  await expect(archive.getByRole("heading", { name: "Archive" })).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(archive).toBeHidden();
  await expect(page.getByRole("img", { name: "Overworld" })).toBeVisible();
});
