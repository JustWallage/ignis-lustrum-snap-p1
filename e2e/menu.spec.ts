import type { Locator, Page } from "@playwright/test";
import { SPAWN } from "../shared/map";
import { expect, pressStart, test, walk } from "./fixtures";

async function cursorTo(page: Page, choice: Locator) {
  for (let press = 0; press < 8; press += 1) {
    if ((await choice.getAttribute("data-selected")) === "true") break;
    await page.keyboard.press("ArrowDown");
  }
  await expect(choice).toHaveAttribute("data-selected", "true");
}

test("SELECT opens the system menu, and the sound toggle sticks", async ({
  page,
}) => {
  await page.goto("/");

  const select = page.getByTestId("select-button");
  await expect(select).toBeDisabled();
  await pressStart(page);
  await expect(select).toBeEnabled();

  const choices = page.getByTestId("dialogue-choices");
  const sound = choices.getByRole("button", { name: /^Sound:/ });
  const install = choices.getByRole("button", { name: "Install app" });

  await select.click();
  await expect(install).toHaveAttribute("data-selected", "true");
  await expect(sound).toHaveText(/Sound: on/);
  await expect(choices.getByRole("button", { name: /^Retry AI/ })).toBeHidden();
  await expect(select).toBeDisabled();

  await page.getByRole("button", { name: "Walk down" }).click();
  await expect(sound).toHaveAttribute("data-selected", "true");
  await page.getByTestId("a-button").click();
  await expect(sound).toHaveText(/Sound: off/);
  await expect(choices).toBeVisible();

  await page.getByRole("button", { name: "B — cancel" }).click();
  await expect(choices).toBeHidden();
  await walk(page, "ArrowRight", SPAWN.x + 1, SPAWN.y);

  await page.reload();
  await pressStart(page);
  await page.keyboard.press("c");
  await expect(page.getByRole("button", { name: "Sound: off" })).toBeVisible();

  // Headless Chromium raises no beforeinstallprompt, so Install app falls back
  // to talking the user through it rather than doing nothing. Reopening put the
  // cursor back on the first item, which is where it lives.
  await expect(install).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toContainText(/install/i);
  await expect(choices).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("dialogue-text")).toBeHidden();
});

test("the SELECT menu is where a session starts and ends", async ({ page }) => {
  await page.goto("/");
  await pressStart(page);

  const select = page.getByTestId("select-button");
  const choices = page.getByTestId("dialogue-choices");
  const text = page.getByTestId("dialogue-text");
  const panel = page.locator(".gb-window");

  await select.click();
  await choices.getByRole("button", { name: "Sign in" }).click();
  await expect(panel.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await panel.getByLabel("Name").fill("tester");
  await panel.getByLabel("Password").fill("test-password-123");
  await panel.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("player-name")).toHaveText("tester");

  // Keys only from here, and the pointer parked off the shell: hovering a
  // choice selects it, and what the confirmation below is worth depends on
  // where the cursor sits when nobody has touched it.
  await page.mouse.move(0, 0);

  await page.keyboard.press("c");
  const signOut = choices.getByRole("button", { name: "Sign out" });
  await expect(signOut).toBeVisible();
  await expect(choices.getByRole("button", { name: "Sign in" })).toBeHidden();
  await cursorTo(page, signOut);
  await page.keyboard.press("Enter");

  await expect(text).toContainText(/sign out\?/i);
  const cancel = choices.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeVisible();
  await expect(cancel).toHaveAttribute("data-selected", "true");
  await expect(signOut).toHaveAttribute("data-selected", "false");

  await page.keyboard.press("Enter");
  await expect(choices).toBeHidden();
  await expect(page.getByTestId("player-name")).toHaveText("tester");

  await page.keyboard.press("c");
  await cursorTo(page, signOut);
  await page.keyboard.press("Enter");
  await expect(cancel).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(signOut).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("player-name")).toBeHidden();
  await expect(page.getByText("BATTERY")).toBeVisible();
  expect((await page.request.get("/api/me")).status()).toBe(401);

  await page.keyboard.press("c");
  await expect(choices.getByRole("button", { name: "Sign in" })).toBeVisible();
});
