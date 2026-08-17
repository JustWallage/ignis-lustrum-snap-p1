import type { Page } from "@playwright/test";
import { juryForDay } from "../shared/juries";
import {
  apiSignIn,
  expect,
  pixelAt,
  pressStart,
  setDay,
  test,
} from "./fixtures";

// Two of the three trees every theme dresses (`src/game/decor.test.ts` pins that), and
// two tiles a player walks on, which nothing is ever allowed to decorate.
const EAST_TREE = { x: 9, y: 4 };
const SOUTH_TREE = { x: 5, y: 8 };
const PATH = { x: 4, y: 6 };
const LAWN = { x: 8, y: 2 };

interface Town {
  east: number[];
  south: number[];
  path: number[];
  lawn: number[];
}

/**
 * Sampled for longer than one 450ms frame flip, which is what forces BOTH overlays to
 * be built: a decorated tile that MOVES between samples means one frame is wearing
 * another day's props — and an overlay keyed on the frame alone fails here every run
 * rather than one in two.
 */
async function readTown(page: Page): Promise<Town> {
  const read = async (): Promise<Town> => ({
    east: await pixelAt(page, EAST_TREE.x, EAST_TREE.y),
    south: await pixelAt(page, SOUTH_TREE.x, SOUTH_TREE.y),
    path: await pixelAt(page, PATH.x, PATH.y),
    lawn: await pixelAt(page, LAWN.x, LAWN.y),
  });
  const held = await read();
  for (let sample = 0; sample < 5; sample += 1) {
    await page.waitForTimeout(120);
    const now = await read();
    expect(now.east).toEqual(held.east);
    expect(now.south).toEqual(held.south);
  }
  return held;
}

test("the day's jury decorates the town, and redecorates it without a reload", async ({
  page,
}) => {
  expect(juryForDay(4).decor).not.toBe(juryForDay(1).decor);
  expect(juryForDay(15).decor).toBe(juryForDay(1).decor);

  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 1");
  const dayOne = await readTown(page);

  await setDay(page, 4);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 4");
  await expect
    .poll(async () => pixelAt(page, EAST_TREE.x, EAST_TREE.y))
    .not.toEqual(dayOne.east);
  const dayFour = await readTown(page);
  expect(dayFour.south).not.toEqual(dayOne.south);

  // The ground the town is painted on is the SAME ground on every day: a theme is props
  // it hangs, not a palette anybody has to walk around in.
  expect(dayFour.path).toEqual(dayOne.path);
  expect(dayFour.lawn).toEqual(dayOne.lawn);

  // The overlay built for jury one before day 4 is the one that must come back.
  await setDay(page, 15);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 15");
  await expect
    .poll(async () => pixelAt(page, EAST_TREE.x, EAST_TREE.y))
    .toEqual(dayOne.east);
  expect(await readTown(page)).toEqual(dayOne);
});
