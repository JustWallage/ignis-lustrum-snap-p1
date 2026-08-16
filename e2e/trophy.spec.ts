import type { Page } from "@playwright/test";
import {
  apiSignIn,
  apiUpload,
  expect,
  INK,
  landTheWheel,
  pressStart,
  readDialogue,
  setDay,
  test,
  walkToTrophy,
} from "./fixtures";

const LOOP_TIMEOUT_MS = 240_000;

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
  await expect(dialog.getByTestId("snap-rating")).toHaveCSS(
    "color",
    INK.juryOnLight,
  );
});

test("the event that just finished is on the plinth, without a reload", async ({
  page,
}) => {
  test.setTimeout(LOOP_TIMEOUT_MS);
  await landTheWheel(page);
  await page.getByTestId("event-done").click();

  await walkToTrophy(page);
  // The landing is what moves the day, and it is the DO's alarm rather than Done that
  // fires it — so the badge is the only honest signal that the day this event judged
  // is over.
  await expect(page.getByTestId("game-day")).toHaveText("DAY 2", {
    timeout: 60_000,
  });
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("dialogue-text")).toContainText(
    /DAY 1'S CHAMPION: TESTER/,
  );
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

test("the plinth never puts the finished day's heading over the day before's champion", async ({
  page,
}) => {
  await apiUpload(page, "rival");
  await apiSignIn(page);
  await setDay(page, 2);
  await apiUpload(page, "voter");
  await apiSignIn(page);

  await page.goto("/");
  await pressStart(page);
  await walkToTrophy(page);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /DAY 1'S CHAMPION: RIVAL/,
  );

  // HELD, because the wrong reading lasts exactly one fetch: the clock reaches the
  // plinth a render before the results for the day it now names do, and against a
  // local server the right answer arrives faster than anything could read the wrong
  // one. Nobody catches this by looking, which is why it is pinned here.
  let release: () => void = () => {
    throw new Error("the results were never held");
  };
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/days/2/results", async (route) => {
    await held;
    await route.continue();
  });

  await setDay(page, 3);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 3");
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /plinth is bare/i,
  );

  release();
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /DAY 2'S CHAMPION: VOTER/,
  );
});

test("the plinth lets go of a champion whose snap is torn up", async ({
  page,
  browser,
}) => {
  const snap = await apiUpload(page, "rival");
  await apiSignIn(page);
  await setDay(page, 2);

  await page.goto("/");
  await pressStart(page);
  await walkToTrophy(page);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /DAY 1'S CHAMPION: RIVAL/,
  );

  const context = await browser.newContext();
  const rival = await context.newPage();
  await apiSignIn(rival, "rival");
  expect((await rival.request.delete(`/api/photos/${snap}`)).ok()).toBeTruthy();
  await context.close();

  await expect(page.getByTestId("dialogue-text")).toContainText(
    /plinth is bare/i,
  );
});

test("an answer for the day before, landing late, does not empty the plinth", async ({
  page,
}) => {
  await apiUpload(page, "rival");
  await apiSignIn(page);
  await setDay(page, 2);
  await apiUpload(page, "voter");
  await apiSignIn(page);

  await page.goto("/");
  await pressStart(page);
  await walkToTrophy(page);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /DAY 1'S CHAMPION: RIVAL/,
  );

  // Moving the clock publishes, and the two frames that carries reach the handler this
  // render committed — which still asks for day 1 — before the clock itself reaches the
  // plinth and it asks for day 2. Holding the OLDER answer is what makes it settle last.
  let release: () => void = () => {
    throw new Error("the older answer was never held");
  };
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/days/1/results", async (route) => {
    await held;
    await route.continue();
  });

  await setDay(page, 3);
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /DAY 2'S CHAMPION: VOTER/,
  );

  // The older answer LANDING is the positive behind the negative below: asserting
  // straight after `release()` reads a plinth the response has not reached yet, and
  // passes against a hook that is about to empty it.
  const late = page.waitForResponse((res) =>
    res.url().includes("/api/days/1/results"),
  );
  release();
  await late;
  // A plain wait, because every retrying assertion here passes on its FIRST sample —
  // the plinth still reads right in the beat between that answer arriving and the hook
  // acting on it. This is the beat, spent, so the emptying has happened if it is going
  // to.
  await page.waitForTimeout(500);
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /DAY 2'S CHAMPION: VOTER/,
  );
});
