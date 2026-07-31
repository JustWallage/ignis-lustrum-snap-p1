import type { Page } from "@playwright/test";
import { MIN_ENABLED_PRIZES, SEED_PRIZES } from "../shared/prizes";
import { apiSignIn, expect, pressStart, test } from "./fixtures";

async function openPrizeManager(page: Page) {
  await page.getByTestId("select-button").click();
  await page
    .getByTestId("dialogue-choices")
    .getByRole("button", { name: "Prize manager" })
    .click();
  const manager = page.getByTestId("prize-manager");
  await expect(manager).toBeVisible();
  return manager;
}

test("the prize manager is the operator's alone", async ({ page }) => {
  await page.goto("/");
  await pressStart(page);
  await page.getByTestId("select-button").click();
  const choices = page.getByTestId("dialogue-choices");
  await expect(
    choices.getByRole("button", { name: "Install app" }),
  ).toBeVisible();
  await expect(
    choices.getByRole("button", { name: "Prize manager" }),
  ).toBeHidden();

  expect((await page.request.get("/api/prizes")).status()).toBe(401);
});

test("an admin adds, renames, reorders and retires prizes", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  const manager = await openPrizeManager(page);

  const rows = manager.locator("li");
  await expect(rows).toHaveCount(SEED_PRIZES.length);
  await expect(manager.getByTestId("prize-warning")).toBeHidden();

  await manager.getByPlaceholder("New prize…").fill("Extra pudding");
  await manager.getByRole("button", { name: "Add" }).click();
  await expect(rows).toHaveCount(SEED_PRIZES.length + 1);
  const added = manager.getByLabel("Prize Extra pudding");
  await expect(added).toBeVisible();
  await expect(rows.last().locator("input")).toHaveValue("Extra pudding");

  await added.fill("Extra toetje");
  await added.press("Enter");
  await expect(manager.getByLabel("Prize Extra toetje")).toBeVisible();

  await manager.getByRole("button", { name: "Move Extra toetje up" }).click();
  await expect(rows.nth(SEED_PRIZES.length - 1).locator("input")).toHaveValue(
    "Extra toetje",
  );
  await page.getByRole("button", { name: "Close" }).click();
  const reopened = await openPrizeManager(page);
  await expect(
    reopened
      .locator("li")
      .nth(SEED_PRIZES.length - 1)
      .locator("input"),
  ).toHaveValue("Extra toetje");
});

test("the manager warns once the wheel has too few enabled prizes", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  const manager = await openPrizeManager(page);
  const warning = manager.getByTestId("prize-warning");

  const disable = manager.getByRole("button", { name: /^Disable / });
  for (let left = SEED_PRIZES.length; left > MIN_ENABLED_PRIZES; left -= 1) {
    await disable.first().click();
    await expect(disable).toHaveCount(left - 1);
    await expect(warning).toBeHidden();
  }
  await disable.first().click();
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(String(MIN_ENABLED_PRIZES));
  await expect(manager.locator("li")).toHaveCount(SEED_PRIZES.length);

  await manager
    .getByRole("button", { name: /^Enable / })
    .first()
    .click();
  await expect(warning).toBeHidden();
});
