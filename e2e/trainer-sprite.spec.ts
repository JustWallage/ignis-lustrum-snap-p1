import type { Page } from "@playwright/test";
import { ARTIST, SPAWN, type Point } from "../shared/map";
import {
  apiSignIn,
  apiStoreAvatar,
  AVATAR_PNG,
  AVATAR_SHIRT,
  AVATAR_TROUSERS,
  DEFAULT_TROUSERS,
  expect,
  joinAs,
  pixelAtPoint,
  pressStart,
  readDialogue,
  spritePixel,
  test,
  walk,
  walkToArtist,
} from "./fixtures";

const LEGS = { sx: 3, sy: 13 };
const CHEST = { sx: 6, sy: 4 };
const MARGIN = { sx: 0, sy: 5 };

const FACING_ARTIST: Point = { x: ARTIST.x - 1, y: ARTIST.y };

async function spriteColour(
  page: Page,
  tile: Point,
  at: { sx: number; sy: number },
): Promise<number[]> {
  const point = spritePixel(tile, at.sx, at.sy);
  return pixelAtPoint(page, point.x, point.y);
}

function expectColour(pixel: number[], expected: number[], what: string): void {
  expect(pixel, what).toHaveLength(3);
  expected.forEach((channel, index) => {
    expect(
      Math.abs((pixel[index] ?? -255) - channel),
      `${what} channel ${String(index)}`,
    ).toBeLessThanOrEqual(8);
  });
}

async function legsAt(page: Page, tile: Point): Promise<string> {
  return (await spriteColour(page, tile, LEGS)).join();
}

test("a player with no sprite of their own walks in the built-in art", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("tester");

  expectColour(
    await spriteColour(page, SPAWN, LEGS),
    DEFAULT_TROUSERS,
    "default legs",
  );
});

test("a generated sprite walks, with its legs tinted to match it", async ({
  page,
}) => {
  await apiSignIn(page);
  await apiStoreAvatar(page);
  await page.goto("/");
  await pressStart(page);

  // The sprite is fetched, decoded and keyed out after the first paint, so the
  // legs change colour a frame or two into the load.
  await expect
    .poll(async () => legsAt(page, SPAWN))
    .not.toBe(DEFAULT_TROUSERS.join());
  const tinted = await spriteColour(page, SPAWN, LEGS);
  expectColour(tinted, AVATAR_TROUSERS, "tinted legs");

  expectColour(
    await spriteColour(page, SPAWN, CHEST),
    AVATAR_SHIRT,
    "the portrait",
  );
  const margin = await spriteColour(page, SPAWN, MARGIN);
  expect(Math.min(...margin), "the keyed-out background").toBeLessThan(240);

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("player-pos")).toHaveAttribute(
    "data-x",
    String(SPAWN.x + 1),
  );
  await expect
    .poll(async () => legsAt(page, { x: SPAWN.x + 1, y: SPAWN.y }))
    .toBe(tinted.join());
});

const RIVAL_TILE: Point = { x: SPAWN.x, y: SPAWN.y + 2 };

async function walkRivalDown(rival: Page): Promise<void> {
  await walk(rival, "ArrowDown", SPAWN.x, SPAWN.y + 1);
  await walk(rival, "ArrowDown", RIVAL_TILE.x, RIVAL_TILE.y);
}

test("a friend's generated sprite walks on your screen too", async ({
  page,
  browser,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  const rival = await joinAs(browser, "rival", { wearing: AVATAR_PNG });
  await walkRivalDown(rival);

  await expect
    .poll(async () => legsAt(page, RIVAL_TILE))
    .toBe(AVATAR_TROUSERS.join());
  expectColour(
    await spriteColour(page, RIVAL_TILE, CHEST),
    AVATAR_SHIRT,
    "the friend's portrait",
  );

  // `workers: 1` means one browser for the whole run, so a context left open is a
  // rival still standing on `RIVAL_TILE` for every spec that follows.
  await rival.context().close();
});

test("a sprite generated mid-session lands on a friend's screen with no reload", async ({
  page,
  browser,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  const rival = await joinAs(browser, "rival");
  await walkRivalDown(rival);
  await expect
    .poll(async () => legsAt(page, RIVAL_TILE))
    .toBe(DEFAULT_TROUSERS.join());

  await apiStoreAvatar(rival);
  await expect
    .poll(async () => legsAt(page, RIVAL_TILE))
    .toBe(AVATAR_TROUSERS.join());

  expect((await rival.request.delete("/api/avatar")).ok()).toBeTruthy();
  await expect
    .poll(async () => legsAt(page, RIVAL_TILE))
    .toBe(DEFAULT_TROUSERS.join());

  await rival.context().close();
});

test("discarding a sprite puts the player back on the built-in one", async ({
  page,
}) => {
  await apiSignIn(page);
  await apiStoreAvatar(page);
  await page.goto("/");
  await pressStart(page);
  await expect
    .poll(async () => legsAt(page, SPAWN))
    .not.toBe(DEFAULT_TROUSERS.join());

  await walkToArtist(page);
  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);

  await choices.getByRole("button", { name: "Take it off" }).click();
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /back to your old self/i,
  );

  await expect
    .poll(async () => legsAt(page, FACING_ARTIST))
    .toBe(DEFAULT_TROUSERS.join());
});
