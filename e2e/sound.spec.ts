import type { Page } from "@playwright/test";
import { SPAWN } from "../shared/map";
import {
  apiSignIn,
  audioLog,
  expect,
  heard,
  joinAs,
  lcd,
  pressStart,
  recordAudio,
  test,
  voices,
  walk,
} from "./fixtures";

/** Every step must be consumed this way for the next to line up: `walk` returns as the
 * stride starts, so its own footstep is still to come. */
async function walkAndHear(
  page: Page,
  key: string,
  x: number,
  y: number,
  count: number,
): Promise<string[]> {
  const before = (await voices(page)).length;
  await walk(page, key, x, y);
  return heard(page, before, count);
}

const START_CHIME = ["square", "square", "square", "square"];

test("no AudioContext exists until START, and then the chime answers", async ({
  page,
}) => {
  const complaints: string[] = [];
  page.on("console", (message) => {
    if (/audiocontext/i.test(message.text())) complaints.push(message.text());
  });

  await recordAudio(page);
  await page.goto("/");

  await expect(page.getByRole("img", { name: "Title screen" })).toBeVisible();
  expect(await audioLog(page)).toEqual({ contexts: 0, voices: [] });

  await pressStart(page);
  await expect.poll(async () => (await audioLog(page)).contexts).toBe(1);
  expect(await heard(page, 0, START_CHIME.length)).toEqual(START_CHIME);
  expect(complaints).toEqual([]);

  expect(
    await walkAndHear(page, "ArrowRight", SPAWN.x + 1, SPAWN.y, 1),
  ).toEqual(["noise"]);

  await walk(page, "ArrowRight", SPAWN.x + 2, SPAWN.y);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => voices(page)).toContain("triangle");
  await expect(page.getByTestId("player-pos")).toHaveAttribute(
    "data-x",
    String(SPAWN.x + 2),
  );

  expect((await audioLog(page)).contexts).toBe(1);
});

test("only START's way INTO the world chimes", async ({ page }) => {
  await recordAudio(page);
  await page.goto("/");
  await pressStart(page);
  expect(await heard(page, 0, START_CHIME.length)).toEqual(START_CHIME);

  const start = page.getByTestId("start-button");
  await start.click();
  await expect(page.getByRole("img", { name: "Title screen" })).toBeVisible();
  expect(await voices(page)).toEqual(START_CHIME);

  await start.click();
  await expect(page.getByRole("img", { name: "Overworld" })).toBeVisible();
  expect(await heard(page, START_CHIME.length, START_CHIME.length)).toEqual(
    START_CHIME,
  );
});

test("the archive door creaks on the way in and on the way out", async ({
  page,
}) => {
  await recordAudio(page);
  await page.goto("/");
  await pressStart(page);

  expect(await walkAndHear(page, "ArrowLeft", 3, SPAWN.y, 1)).toEqual([
    "noise",
  ]);
  expect(await walkAndHear(page, "ArrowLeft", 2, SPAWN.y, 1)).toEqual([
    "noise",
  ]);

  expect(await walkAndHear(page, "ArrowUp", 2, 2, 4)).toEqual([
    "noise",
    "noise",
    "noise",
    "triangle",
  ]);

  expect(await walkAndHear(page, "ArrowDown", 2, 4, 4)).toEqual([
    "noise",
    "noise",
    "noise",
    "noise",
  ]);
});

test("you can hear a friend walking, and the door they go through", async ({
  page,
  browser,
}) => {
  await recordAudio(page);
  await page.goto("/");
  await pressStart(page);

  const rival = await joinAs(browser, "rival");
  await expect(lcd(page)).toHaveAttribute("aria-label", /rival/);
  const before = (await voices(page)).length;
  expect(before).toBe(START_CHIME.length);

  await walk(rival, "ArrowLeft", SPAWN.x - 1, SPAWN.y);
  expect(await heard(page, before, 1)).toEqual(["noise"]);
  await walk(rival, "ArrowLeft", SPAWN.x - 2, SPAWN.y);
  expect(await heard(page, before + 1, 1)).toEqual(["noise"]);

  await walk(rival, "ArrowUp", 2, 2);
  expect(await heard(page, before + 2, 4)).toEqual([
    "noise",
    "noise",
    "noise",
    "triangle",
  ]);

  await rival.context().close();
  await expect(lcd(page)).not.toHaveAttribute("aria-label", /rival/);
  expect((await voices(page)).length).toBe(before + 6);
});

test("a muted player hears nobody else either", async ({ page, browser }) => {
  await recordAudio(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("ignis-snaps.muted", "1");
  });
  await page.reload();
  await pressStart(page);
  await expect.poll(async () => (await audioLog(page)).contexts).toBe(1);

  const rival = await joinAs(browser, "rival");
  await expect(lcd(page)).toHaveAttribute("aria-label", /rival/);
  await walk(rival, "ArrowLeft", SPAWN.x - 1, SPAWN.y);
  await walk(rival, "ArrowLeft", SPAWN.x - 2, SPAWN.y);
  expect(await voices(page)).toEqual([]);

  await rival.context().close();
});

test("advancing the jury's dialogue bleeps", async ({ page }) => {
  await apiSignIn(page);
  await recordAudio(page);
  await page.goto("/");
  await pressStart(page);

  await walk(page, "ArrowRight", SPAWN.x + 1, SPAWN.y);
  await walk(page, "ArrowRight", SPAWN.x + 2, SPAWN.y);
  const beforeTalking = (await voices(page)).length;

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toBeVisible();
  await expect
    .poll(async () => (await voices(page)).length)
    .toBeGreaterThan(beforeTalking);

  const beforeAdvancing = (await voices(page)).length;
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await voices(page)).length)
    .toBeGreaterThan(beforeAdvancing);
});

test("a muted player hears nothing, and stays muted across a reload", async ({
  page,
}) => {
  await recordAudio(page);
  await page.goto("/");
  await page.evaluate(() => {
    // Spelled out rather than imported: knip's project is src/worker/shared, so
    // an export only the e2e suite reads would read as dead code.
    localStorage.setItem("ignis-snaps.muted", "1");
  });
  await page.reload();

  await pressStart(page);
  await expect.poll(async () => (await audioLog(page)).contexts).toBe(1);

  await walk(page, "ArrowRight", SPAWN.x + 1, SPAWN.y);
  await walk(page, "ArrowRight", SPAWN.x + 2, SPAWN.y);
  expect(await voices(page)).toEqual([]);
});
