import { juryForDay } from "../shared/juries";
import { apiSignIn, expect, pressStart, test } from "./fixtures";

// `workers: 1` against one shared database, so a second client is a second CONTEXT
// inside this test rather than a second worker.

test("a second client is pushed the new day over its socket", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 1");

  const baseURL = test.info().project.use.baseURL;
  const other = await browser.newContext(
    baseURL === undefined ? {} : { baseURL },
  );
  try {
    const otherPage = await other.newPage();
    await apiSignIn(otherPage);
    await otherPage.goto("/");
    await pressStart(otherPage);
    await expect(otherPage.getByTestId("game-day")).toHaveText("DAY 1");

    const moved = await otherPage.request.post("/api/test/reset", {
      data: { day: 4 },
    });
    expect(moved.ok()).toBeTruthy();

    const later = juryForDay(4);
    for (const client of [otherPage, page]) {
      await expect(client.getByTestId("game-day")).toHaveText("DAY 4");
      await expect(client.getByTestId("game-theme")).toHaveText(
        later.theme.toUpperCase(),
      );
    }
  } finally {
    await other.close();
  }
});
