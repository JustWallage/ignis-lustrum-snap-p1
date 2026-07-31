import type { Page } from "@playwright/test";
import {
  apiSignIn,
  apiUpload,
  expect,
  pressStart,
  readDialogue,
  setDay,
  test,
  walkToTrophy,
} from "./fixtures";

const NOTICE_ENDS = /crowned when a day is revealed\./i;

/** Waiting for the END of the page matters: A finishes a half-typed page before it
 * closes one, so pressing on a still-revealing notice is one press short. */
async function readNotice(page: Page): Promise<void> {
  const text = page.getByTestId("dialogue-text");
  await expect(text).toContainText(NOTICE_ENDS);
  await page.keyboard.press("Enter");
  await expect(text).toBeHidden();
}

test("day one has nothing on the plinth", async ({ page }) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 1");

  await walkToTrophy(page);
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("dialogue-text")).toContainText(
    /no champion yet/i,
  );
  await expect(page.getByTestId("dialogue-choices")).toBeHidden();
  await readNotice(page);
});

test("an anonymous walker is asked to sign in", async ({ page }) => {
  await page.goto("/");
  await pressStart(page);

  await walkToTrophy(page);
  await expect(page.getByText(/sign in to see the champion/i)).toBeVisible();
  await page.keyboard.press("Enter");

  const dialog = page.locator(".gb-window");
  await expect(dialog.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("a finished day puts its winner on the plinth", async ({ page }) => {
  await apiUpload(page, "rival");
  await apiSignIn(page);
  await setDay(page, 2);

  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 2");

  await walkToTrophy(page);
  await expect(page.getByText(/look at the trophy/i)).toBeVisible();
  await page.keyboard.press("Enter");

  const text = page.getByTestId("dialogue-text");
  await expect(text).toContainText(/DAY 1'S CHAMPION: RIVAL/);
  await expect(text).toContainText(/on \d+ points/);

  const choices = await readDialogue(page);
  await expect(text).toContainText(/jury stared/i);

  await choices.getByRole("button", { name: "See the snap" }).click();
  const dialog = page.locator(".gb-window");
  await expect(dialog.getByRole("heading", { name: "Snap" })).toBeVisible();
  await expect(dialog.getByRole("img")).toBeVisible();
  // The plinth is `SnapDialog`'s surviving caller on a REVEALED day, so it is the one
  // place a spec can read the verdict off that window rather than the big viewer.
  await expect(dialog.getByTestId("snap-rating")).toContainText(/\d+\/10/);
});

test("the plinth follows the clock", async ({ page }) => {
  await apiUpload(page, "rival");
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  await walkToTrophy(page);
  await page.keyboard.press("Enter");
  await readNotice(page);

  await setDay(page, 2);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 2");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /DAY 1'S CHAMPION: RIVAL/,
  );
});
