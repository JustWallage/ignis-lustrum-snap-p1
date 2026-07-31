import { SPAWN } from "../shared/map";
import {
  apiSignIn,
  expect,
  joinAs,
  lcd,
  pixelAtPoint,
  pressStart,
  test,
  walk,
  walkToJury,
} from "./fixtures";

const STAGE = { x: SPAWN.x, y: SPAWN.y + 2 };

/** A point ONLY a wide three-line bubble reaches — no sprite, no name bubble, no NPC
 * and no count ever paints here — so the pixel changing means a bubble arrived. */
const ABOVE = { x: STAGE.x + 2.25, y: STAGE.y - 1.375 };

/** Three lines' worth, and full of the letters that also WALK: `KEY_DIRS` reads W, A,
 * S and D, so a field that let them through would march the player across the map. */
const MESSAGE = "Where are you all sat down today?";

test("a friend speaks, the town sees the bubble, and it expires on its own", async ({
  page,
  browser,
}) => {
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await walk(page, "ArrowLeft", SPAWN.x - 1, SPAWN.y);
  await walk(page, "ArrowLeft", SPAWN.x - 2, SPAWN.y);

  const rival = await joinAs(browser, "rival");
  await expect(lcd(page)).toHaveAttribute("aria-label", /rival/);
  await walk(rival, "ArrowDown", SPAWN.x, SPAWN.y + 1);
  await walk(rival, "ArrowDown", STAGE.x, STAGE.y);

  const quiet = (await pixelAtPoint(page, ABOVE.x, ABOVE.y)).join();

  await rival.keyboard.press("x");
  const field = rival.getByTestId("say-input");
  await expect(field).toBeVisible();
  await field.pressSequentially(MESSAGE);
  const pos = rival.getByTestId("player-pos");
  await expect(pos).toHaveAttribute("data-x", String(STAGE.x));
  await expect(pos).toHaveAttribute("data-y", String(STAGE.y));

  await field.press("Enter");
  await expect(field).toBeHidden();

  await expect
    .poll(async () => (await pixelAtPoint(page, ABOVE.x, ABOVE.y)).join())
    .not.toBe(quiet);
  expect((await pixelAtPoint(rival, ABOVE.x, ABOVE.y)).join()).not.toBe(quiet);

  await expect
    .poll(async () => (await pixelAtPoint(page, ABOVE.x, ABOVE.y)).join(), {
      timeout: 15_000,
    })
    .toBe(quiet);
  await expect
    .poll(async () => (await pixelAtPoint(rival, ABOVE.x, ABOVE.y)).join(), {
      timeout: 15_000,
    })
    .toBe(quiet);

  await rival.context().close();
});

test("a walker with no session has nothing to say", async ({ page }) => {
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toBeHidden();

  await page.keyboard.press("x");
  await expect(page.getByTestId("say-input")).toBeHidden();
  await page.getByRole("button", { name: "B — cancel" }).click();
  await expect(page.getByTestId("say-input")).toBeHidden();
});

test("B is still the way out of everything else", async ({ page }) => {
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);

  await page.getByTestId("select-button").click();
  await expect(page.getByTestId("dialogue-choices")).toBeVisible();
  await page.keyboard.press("x");
  await expect(page.getByTestId("dialogue-choices")).toBeHidden();
  await expect(page.getByTestId("say-input")).toBeHidden();

  await walkToJury(page);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toBeVisible();
  await page.getByRole("button", { name: "B — cancel" }).click();
  await expect(page.getByTestId("dialogue-text")).toBeHidden();
  await expect(page.getByTestId("say-input")).toBeHidden();

  await page.keyboard.press("x");
  await expect(page.getByTestId("say-input")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("say-input")).toBeHidden();
});
