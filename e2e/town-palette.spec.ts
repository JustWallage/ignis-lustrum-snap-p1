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

const TREE = { x: 0, y: 4 };
const GRASS = { x: 8, y: 2 };

interface TownColours {
  tree: number[];
  grass: number[];
}

/**
 * Sampled for longer than one 450ms frame flip, which is what forces BOTH atlases to be
 * built: this art is identical in the two frames, so a sample that MOVES means one frame
 * is wearing another day's colours — and a cache keyed on the frame alone fails here
 * every run rather than one in two.
 */
async function townColours(page: Page): Promise<TownColours> {
  const read = async (): Promise<TownColours> => ({
    tree: await pixelAt(page, TREE.x, TREE.y),
    grass: await pixelAt(page, GRASS.x, GRASS.y),
  });
  const held = await read();
  for (let sample = 0; sample < 5; sample += 1) {
    await page.waitForTimeout(120);
    expect(await read()).toEqual(held);
  }
  return held;
}

test("the town wears the day's colours, and changes them without a reload", async ({
  page,
}) => {
  expect(juryForDay(4).palette).not.toBe(juryForDay(1).palette);
  expect(juryForDay(15).palette).toBe(juryForDay(1).palette);

  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 1");
  const dayOne = await townColours(page);

  await setDay(page, 4);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 4");
  await expect
    .poll(async () => pixelAt(page, TREE.x, TREE.y))
    .not.toEqual(dayOne.tree);
  const dayFour = await townColours(page);
  expect(dayFour.grass).not.toEqual(dayOne.grass);

  await setDay(page, 15);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 15");
  await expect
    .poll(async () => pixelAt(page, TREE.x, TREE.y))
    .toEqual(dayOne.tree);
  expect(await townColours(page)).toEqual(dayOne);
});
