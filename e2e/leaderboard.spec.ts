import type { Page } from "@playwright/test";
import {
  apiSignIn,
  apiUpload,
  boxOf,
  expect,
  pressStart,
  setDay,
  test,
  walkToShelf,
} from "./fixtures";

/** `voter` and `judge` never upload, so the standings carry two players with nothing in
 * the archive — the case the last two tests click on. */
async function twoRevealedDays(page: Page): Promise<void> {
  const mine = await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await apiSignIn(page, "voter");
  const vote = await page.request.put("/api/votes", {
    data: { photoIds: [mine] },
  });
  expect(vote.ok()).toBeTruthy();

  await apiSignIn(page, "tester");
  await setDay(page, 2);
  await apiUpload(page, "tester");
  await setDay(page, 3);
  await apiSignIn(page, "tester");
}

async function openStandings(page: Page) {
  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await page.keyboard.press("Enter");
  const archive = page.getByTestId("archive");
  await expect(archive.getByRole("heading", { name: "Archive" })).toBeVisible();
  await archive.getByRole("button", { name: "Standings" }).click();
  await expect(page.getByTestId("leaderboard")).toBeVisible();
  return archive;
}

test("two revealed days add up into a podium on the shelf", async ({
  page,
}) => {
  await twoRevealedDays(page);

  const archive = await openStandings(page);
  const board = page.getByTestId("leaderboard");

  const podium = board.locator(".gb-podium");
  await expect(podium).toHaveCount(3);
  await expect(podium.first()).toContainText("#1");
  await expect(podium.first()).toContainText("tester");
  await expect(podium.first()).toContainText("2 days");
  await expect(podium.first()).toContainText("2 won");

  await expect(podium.nth(1)).toContainText("rival");
  await expect(podium.nth(1)).toContainText("1 day");
  await expect(podium.nth(2)).toContainText("judge");
  await expect(podium.nth(2)).toContainText("0 days");
  await expect(board).toContainText("voter");

  // Four seeded players leave ONE row below the podium, so nothing overflows here and
  // "the last player is reachable" would pass against the 10rem cap this replaced —
  // only the boxes catch it.
  await expect(board.getByTestId("standings")).toHaveCSS("max-height", "none");
  const list = await boxOf(page, "standings");
  const panel = await boxOf(page, "standings-panel");
  expect(list.height).toBeGreaterThan(160);
  expect(list.y + list.height).toBeGreaterThan(panel.y + panel.height - 20);

  // `exact`, because a standing is a button now and "2 days" is part of its name.
  await archive.getByRole("button", { name: "Days", exact: true }).click();
  await expect(page.getByTestId("archive-results")).toBeVisible();
});

test("tapping a plinth opens that player's photographs", async ({ page }) => {
  await twoRevealedDays(page);

  const archive = await openStandings(page);
  await page.getByTestId("leaderboard").locator(".gb-podium").first().click();

  await expect(
    archive.getByRole("button", { name: "Days", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByTestId("archive-days").getByRole("button", { name: "All days" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByTestId("archive-people")
      .getByRole("button", { name: "tester", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("archive-card")).toHaveCount(2);
  await expect(page.getByTestId("archive-results")).not.toContainText("rival");
});

test("tapping a player with nothing in says so on the Days view", async ({
  page,
}) => {
  await twoRevealedDays(page);

  await openStandings(page);
  await page.getByTestId("standing").filter({ hasText: "voter" }).click();

  await expect(
    page
      .getByTestId("archive-people")
      .getByRole("button", { name: "voter", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("archive-none")).toBeVisible();
});

test("nobody is ahead until a day has been revealed", async ({ page }) => {
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");

  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await page.keyboard.press("Enter");
  await page
    .getByTestId("archive")
    .getByRole("button", { name: "Standings" })
    .click();

  await expect(page.getByTestId("leaderboard-empty")).toContainText(
    /no day has been revealed/i,
  );
});
