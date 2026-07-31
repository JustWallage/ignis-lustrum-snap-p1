import type { Page } from "@playwright/test";
import { SPAWN } from "../shared/map";
import {
  apiSignIn,
  expect,
  joinAs,
  lcd,
  pressStart,
  test,
  USERS,
  walk,
} from "./fixtures";

const STAGE = { x: SPAWN.x, y: SPAWN.y + 2 };
const CONTROL = { x: SPAWN.x + 1, y: SPAWN.y + 2 };

async function pixelAt(
  page: Page,
  tile: { x: number; y: number },
): Promise<number[]> {
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector("canvas");
    if (canvas === null) throw new Error("the LCD canvas is missing");
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("the LCD has no 2d context");
    const { data } = ctx.getImageData(x * 16 + 8, y * 16 + 8, 1, 1);
    return Array.from(data).slice(0, 3);
  }, tile);
}

test("friends walk the same screen, pass through each other, and leave", async ({
  page,
  browser,
}) => {
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("tester");

  expect(await pixelAt(page, STAGE)).toEqual(await pixelAt(page, CONTROL));

  const rival = await joinAs(browser, "rival");
  await expect(lcd(page)).toHaveAttribute("aria-label", /rival/);
  await expect(lcd(rival)).toHaveAttribute("aria-label", /tester/);

  await walk(rival, "ArrowDown", SPAWN.x, SPAWN.y + 1);
  await walk(rival, "ArrowDown", STAGE.x, STAGE.y);
  await expect
    .poll(async () => (await pixelAt(page, STAGE)).join())
    .not.toBe((await pixelAt(page, CONTROL)).join());

  const voter = await joinAs(browser, "voter");
  await expect(lcd(voter)).toHaveAttribute("aria-label", /rival/);
  await expect(lcd(voter)).toHaveAttribute("aria-label", /tester/);
  await voter.context().close();

  await walk(page, "ArrowDown", SPAWN.x, SPAWN.y + 1);
  await walk(page, "ArrowDown", STAGE.x, STAGE.y);
  await walk(page, "ArrowDown", STAGE.x, STAGE.y + 1);

  await rival.context().close();
  await expect(lcd(page)).not.toHaveAttribute("aria-label", /rival/);
  await expect
    .poll(async () => (await pixelAt(page, STAGE)).join())
    .toBe((await pixelAt(page, CONTROL)).join());
});

test("an anonymous visitor watches the town without joining it", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toBeHidden();

  const tester = await joinAs(browser, "tester");
  await expect(lcd(page)).toHaveAttribute("aria-label", /tester/);
  await walk(page, "ArrowRight", SPAWN.x + 1, SPAWN.y);
  await walk(tester, "ArrowLeft", SPAWN.x - 1, SPAWN.y);

  await expect(lcd(tester)).toHaveAttribute("aria-label", "Overworld");

  await page.getByTestId("select-button").click();
  await page
    .getByTestId("dialogue-choices")
    .getByRole("button", { name: "Sign in" })
    .click();
  const dialog = page.locator(".gb-window");
  await dialog.getByLabel("Name").fill("rival");
  await dialog.getByLabel("Password").fill(USERS.rival);
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("player-name")).toHaveText("rival");
  await expect(lcd(tester)).toHaveAttribute("aria-label", /rival/);

  await tester.context().close();
});
