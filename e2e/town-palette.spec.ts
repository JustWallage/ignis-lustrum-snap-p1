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

// Two tiles nobody stands on: the tree column down the map's left edge, and the grass
// east of the house.
const TREE = { x: 0, y: 4 };
const GRASS = { x: 8, y: 2 };

interface TownColours {
  tree: number[];
  grass: number[];
}

/**
 * Both tiles, held still across a whole animation period.
 *
 * This art is identical in the two frames, so a sample that MOVES means one frame's
 * atlas is wearing a different day's colours from the other's — and sampling long
 * enough to force BOTH frames to be built is what makes a cache keyed on the frame
 * alone fail here every run rather than one in two.
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

  // Moving the clock is behind the cookie; walking in and looking at the town is not.
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 1");
  const dayOne = await townColours(page);

  await setDay(page, 4);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 4");
  // Polled: the badge resolves a frame before the pixels follow it.
  await expect
    .poll(async () => pixelAt(page, TREE.x, TREE.y))
    .not.toEqual(dayOne.tree);
  const dayFour = await townColours(page);
  expect(dayFour.grass).not.toEqual(dayOne.grass);

  // The atlas built for jury one before day 4 is the one that must come back.
  await setDay(page, 15);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 15");
  await expect
    .poll(async () => pixelAt(page, TREE.x, TREE.y))
    .toEqual(dayOne.tree);
  expect(await townColours(page)).toEqual(dayOne);
});
