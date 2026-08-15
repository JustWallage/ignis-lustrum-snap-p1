import type { Browser, Page } from "@playwright/test";
import { NO_VOTE_MULTIPLIER } from "../shared/scoring";
import {
  apiSignIn,
  apiUpload,
  dropSocket,
  expect,
  hostNext,
  operate,
  pressStart,
  reachPhase,
  reachPodium,
  reachScoreboard,
  recordSockets,
  test,
  USERS,
} from "./fixtures";

const PODIUM_TIMEOUT_MS = 240_000;

const HELD_PAST_MS = 12_000;

async function watcher(
  browser: Browser,
  name: keyof typeof USERS,
  prepare?: (page: Page) => Promise<void>,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await apiSignIn(page, name);
  await prepare?.(page);
  await page.goto("/");
  await pressStart(page);
  return page;
}

/** A friend arriving mid-reveal. There is no START to press — a load that finds a live
 * event skips the title screen — so this waits for the OVERLAY. */
async function joinMidEvent(
  browser: Browser,
  name: keyof typeof USERS,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await apiSignIn(page, name);
  await page.goto("/");
  await expect(page.getByTestId("event-overlay")).toBeVisible({
    timeout: 30_000,
  });
  return page;
}

async function aDay(
  page: Page,
  who: readonly (keyof typeof USERS)[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const name of who) ids.push(await apiUpload(page, name));
  for (const [at, name] of who.entries()) {
    await apiSignIn(page, name);
    const res = await page.request.put("/api/votes", {
      data: { photoIds: ids.filter((_id, index) => index !== at) },
    });
    expect(res.ok()).toBeTruthy();
  }
  return ids;
}

test("the host walks 3 to 2 to 1 and every other screen follows", async ({
  page,
  browser,
}) => {
  test.setTimeout(PODIUM_TIMEOUT_MS);
  await aDay(page, ["tester", "rival", "voter"]);

  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  const friend = await watcher(browser, "rival");
  await operate(page, "Start event", "Start it");

  await expect(page.getByTestId("reveal-photo")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("crowd-character")).toHaveCount(0);

  for (const place of ["3RD", "2ND", "1ST"]) {
    await reachPodium(page, place);
    await reachPodium(friend, place);
    for (const screen of [page, friend]) {
      await expect(screen.getByTestId("podium-photo")).toBeVisible();
      await expect(screen.getByTestId("podium-name")).not.toBeEmpty();
      const figures = screen.getByTestId("crowd-character");
      await expect(figures).toHaveCount(1);
      const named = await screen.getByTestId("podium-name").textContent();
      await expect(figures).toHaveAttribute(
        "data-player",
        named?.toLowerCase() ?? "",
      );
      await expect(screen.getByTestId("podium-critique")).not.toBeEmpty();
      await expect(screen.getByTestId("podium-score")).toContainText("PEER");
      await expect(screen.getByTestId("podium-rating")).toContainText("/");
      await expect(screen.getByTestId("podium-score")).toContainText(/curved/i);
    }
    await expect(friend.getByTestId("podium-next")).toBeHidden();
    await expect(friend.getByTestId("podium-waiting")).toHaveText(
      "WAITING FOR THE HOST",
    );
    await expect(page.getByTestId("podium-next")).toBeVisible();
    await hostNext(page);
    for (const screen of [page, friend]) {
      await expect(screen.getByTestId("podium-next-in")).toContainText(
        /NEXT IN [123]/,
      );
    }
  }

  for (const screen of [page, friend]) await reachScoreboard(screen);

  await friend.context().close();
});

test("host and non-host are on the same page at every boundary, 3 to the scoreboard", async ({
  page,
  browser,
}) => {
  test.setTimeout(PODIUM_TIMEOUT_MS);
  await aDay(page, ["tester", "rival", "voter"]);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  const friend = await watcher(browser, "rival");
  await operate(page, "Start event", "Start it");

  const screens = [page, friend];
  for (const place of ["3RD", "2ND", "1ST"]) {
    for (const screen of screens) await reachPodium(screen, place);
    for (const screen of screens) {
      await expect(screen.getByTestId("podium-place")).toHaveText(
        `${place} PLACE`,
      );
    }
    await expect(friend.getByTestId("podium-next")).toBeHidden();
    await hostNext(page);
  }
  for (const screen of screens) await reachScoreboard(screen);
  await expect(friend.getByTestId("podium-next")).toBeHidden();

  await hostNext(page);
  for (const screen of screens) await reachPhase(screen, "wheel");

  await friend.context().close();
});

test("the winner's card does not advance on its own", async ({
  page,
  browser,
}) => {
  test.setTimeout(PODIUM_TIMEOUT_MS);
  await aDay(page, ["tester", "rival"]);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  const friend = await watcher(browser, "rival");
  await operate(page, "Start event", "Start it");

  await reachPodium(page, "2ND");
  await hostNext(page);
  for (const screen of [page, friend]) await reachPodium(screen, "1ST");

  await page.waitForTimeout(HELD_PAST_MS);

  for (const screen of [page, friend]) {
    await expect(screen.getByTestId("podium-place")).toHaveText("1ST PLACE");
    await expect(screen.getByTestId("event-overlay")).toHaveAttribute(
      "data-phase",
      "reveal",
    );
  }
  await expect(page.getByTestId("scoreboard")).toBeHidden();
  await hostNext(page);
  for (const screen of [page, friend]) await reachScoreboard(screen);

  await friend.context().close();
});

test("a client that missed a transition re-syncs on reconnect", async ({
  page,
  browser,
}) => {
  test.setTimeout(PODIUM_TIMEOUT_MS);
  await aDay(page, ["tester", "rival", "voter"]);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  const friend = await watcher(browser, "voter", recordSockets);
  await operate(page, "Start event", "Start it");
  for (const screen of [page, friend]) await reachPodium(screen, "3RD");

  // The socket dies and the DO has let go before anything moves, so the advance below
  // genuinely happens without them and their retry lands after it.
  await dropSocket(friend);
  await hostNext(page);
  await reachPodium(page, "2ND");

  await reachPodium(friend, "2ND");
  await expect(friend.getByTestId("podium-next")).toBeHidden();

  await friend.context().close();
});

test("a browser joining mid-podium lands on the rank everyone else is on", async ({
  page,
  browser,
}) => {
  test.setTimeout(PODIUM_TIMEOUT_MS);
  await aDay(page, ["tester", "rival", "voter"]);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await reachPodium(page, "3RD");
  await hostNext(page);
  await reachPodium(page, "2ND");

  const latecomer = await joinMidEvent(browser, "judge");
  await reachPodium(latecomer, "2ND");
  await expect(latecomer.getByTestId("podium-next")).toBeHidden();
  await expect(latecomer.getByTestId("podium-waiting")).toBeVisible();

  await latecomer.context().close();
});

test("a second Next during the build-up does not double-advance", async ({
  page,
  browser,
}) => {
  test.setTimeout(PODIUM_TIMEOUT_MS);
  await aDay(page, ["tester", "rival", "voter"]);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  const friend = await watcher(browser, "rival");
  await operate(page, "Start event", "Start it");
  for (const screen of [page, friend]) await reachPodium(screen, "3RD");

  await hostNext(page);
  await expect(page.getByTestId("podium-next-in")).toBeVisible();
  // Mid-build-up the button is gone, so this asks the route directly — which is
  // what a second tab of the host's own, or a stale screen, would do.
  const again = await page.request.post("/api/admin/event/next");
  expect(again.status()).toBe(409);

  for (const screen of [page, friend]) await reachPodium(screen, "2ND");
  await page.waitForTimeout(HELD_PAST_MS);
  for (const screen of [page, friend]) {
    await expect(screen.getByTestId("podium-place")).toHaveText("2ND PLACE");
  }

  await friend.context().close();
});

test("the host's Next asks first, and Cancel leaves both screens where they were", async ({
  page,
  browser,
}) => {
  test.setTimeout(PODIUM_TIMEOUT_MS);
  await aDay(page, ["tester", "rival"]);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  const friend = await watcher(browser, "rival");
  await operate(page, "Start event", "Start it");
  for (const screen of [page, friend]) await reachPodium(screen, "2ND");

  await page.getByTestId("podium-next").click();
  const choices = page.getByTestId("dialogue-choices");
  await expect(choices).toBeVisible();
  await expect(choices.getByRole("button").first()).toHaveText(/Cancel/);
  await choices.getByRole("button", { name: "Cancel" }).click();

  for (const screen of [page, friend]) {
    await expect(screen.getByTestId("podium-place")).toHaveText("2ND PLACE");
    await expect(screen.getByTestId("podium-next-in")).toBeHidden();
  }
  await expect(page.getByTestId("podium-next")).toBeVisible();
  await expect(friend.getByTestId("podium-waiting")).toBeVisible();

  await hostNext(page);
  for (const screen of [page, friend]) await reachPodium(screen, "1ST");

  await friend.context().close();
});

test("a podium photo opens full screen, and a host advance closes it", async ({
  page,
  browser,
}) => {
  test.setTimeout(PODIUM_TIMEOUT_MS);
  await aDay(page, ["tester", "rival", "voter"]);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  const friend = await watcher(browser, "voter");
  await operate(page, "Start event", "Start it");
  await reachPodium(page, "3RD");
  await reachPodium(friend, "3RD");

  await friend.getByTestId("podium-photo").click();
  await expect(friend.getByTestId("podium-photo-full")).toBeVisible();

  await hostNext(page);
  await expect(friend.getByTestId("podium-photo-full")).toBeHidden({
    timeout: 30_000,
  });
  await reachPodium(friend, "2ND");

  await friend.context().close();
});

test("the podium shows the no-vote penalty, and the jury's caption", async ({
  page,
}) => {
  test.setTimeout(PODIUM_TIMEOUT_MS);
  const mine = await apiUpload(page, "tester");
  const theirs = await apiUpload(page, "rival");
  await apiSignIn(page, "tester");
  const voted = await page.request.put("/api/votes", {
    data: { photoIds: [theirs] },
  });
  expect(voted.ok()).toBeTruthy();

  const caption = "Study In Fluorescent Regret";
  const captioned = await page.request.post("/api/test/caption", {
    data: { photoId: mine, caption },
  });
  expect(captioned.ok()).toBeTruthy();

  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");

  await reachPodium(page, "2ND");
  await expect(page.getByTestId("podium-name")).toHaveText("RIVAL");
  await expect(page.getByTestId("podium-penalty")).toContainText(
    `×${String(NO_VOTE_MULTIPLIER)}`,
  );

  await hostNext(page);
  await reachPodium(page, "1ST");
  await expect(page.getByTestId("podium-name")).toHaveText("TESTER");
  await expect(page.getByTestId("podium-penalty")).toBeHidden();
  await expect(page.getByTestId("podium-caption")).toContainText(caption);

  await reachPhase(page, "reveal");
});
