import {
  apiSignIn,
  apiUpload,
  expect,
  pressStart,
  setDay,
  test,
  walkToShelf,
} from "./fixtures";

test("two revealed days add up into a podium on the shelf", async ({
  page,
}) => {
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

  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await page.keyboard.press("Enter");
  const archive = page.getByTestId("archive");
  await expect(archive.getByRole("heading", { name: "Archive" })).toBeVisible();

  await archive.getByRole("button", { name: "Standings" }).click();
  const board = page.getByTestId("leaderboard");
  await expect(board).toBeVisible();

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

  await archive.getByRole("button", { name: "Days" }).click();
  await expect(page.getByTestId("archive-results")).toBeVisible();
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
