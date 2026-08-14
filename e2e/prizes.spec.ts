import { MIN_ENABLED_PRIZES, SEED_PRIZES } from "../shared/prizes";
import {
  apiSignIn,
  expect,
  expectConsoleRefused,
  openConsole,
  test,
} from "./fixtures";

test("the prize manager is the operator's alone", async ({ page }) => {
  await expectConsoleRefused(page);
  expect((await page.request.get("/api/prizes")).status()).toBe(401);

  await apiSignIn(page, "rival");
  await expectConsoleRefused(page);
});

test("an admin adds, renames, reorders and retires prizes", async ({
  page,
}) => {
  await apiSignIn(page);
  const panel = await openConsole(page, "Prizes");

  const rows = panel.locator("li");
  await expect(rows).toHaveCount(SEED_PRIZES.length);
  await expect(panel.getByTestId("ops-prize-warning")).toBeHidden();

  await panel.getByPlaceholder("New prize…").fill("Extra pudding");
  await panel.getByRole("button", { name: "Add" }).click();
  await expect(rows).toHaveCount(SEED_PRIZES.length + 1);
  const added = panel.getByLabel("Prize Extra pudding");
  await expect(added).toBeVisible();
  await expect(rows.last().locator("input")).toHaveValue("Extra pudding");

  await added.fill("Extra toetje");
  await added.press("Enter");
  await expect(panel.getByLabel("Prize Extra toetje")).toBeVisible();

  await panel.getByRole("button", { name: "Move Extra toetje up" }).click();
  await expect(rows.nth(SEED_PRIZES.length - 1).locator("input")).toHaveValue(
    "Extra toetje",
  );

  // Destructive, so it asks IN PLACE rather than opening anything.
  await panel
    .getByRole("button", { name: "Delete", exact: true })
    .nth(SEED_PRIZES.length - 1)
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await panel.getByRole("button", { name: "Delete it" }).click();
  await expect(rows).toHaveCount(SEED_PRIZES.length);
  await expect(panel.getByLabel("Prize Extra toetje")).toBeHidden();

  const reopened = await openConsole(page, "Prizes");
  await expect(reopened.locator("li")).toHaveCount(SEED_PRIZES.length);
});

test("the manager warns once the wheel has too few enabled prizes", async ({
  page,
}) => {
  await apiSignIn(page);
  const panel = await openConsole(page, "Prizes");
  const warning = panel.getByTestId("ops-prize-warning");

  const disable = panel.getByRole("button", { name: /^Disable / });
  for (let left = SEED_PRIZES.length; left > MIN_ENABLED_PRIZES; left -= 1) {
    await disable.first().click();
    await expect(disable).toHaveCount(left - 1);
    await expect(warning).toBeHidden();
  }
  await disable.first().click();
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(String(MIN_ENABLED_PRIZES));
  await expect(panel.locator("li")).toHaveCount(SEED_PRIZES.length);

  await panel
    .getByRole("button", { name: /^Enable / })
    .first()
    .click();
  await expect(warning).toBeHidden();
});
