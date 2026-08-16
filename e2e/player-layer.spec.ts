import type { Page } from "@playwright/test";
import { SPAWN, VOTING, type Point } from "../shared/map";
import {
  apiSignIn,
  apiUpload,
  DEFAULT_TROUSERS,
  expect,
  joinAs,
  pixelAtPoint,
  pressStart,
  spritePixel,
  test,
  walk,
} from "./fixtures";

/** The trousers, and they are the probe on purpose: a name bubble is drawn with its
 * BOTTOM on the top of the sprite it belongs to, so what a friend standing one row
 * lower covers is the lower half of your tile. */
const LEGS = { sx: 3, sy: 13 };

const BELOW: Point = { x: SPAWN.x, y: SPAWN.y + 1 };

const TWO_BELOW: Point = { x: SPAWN.x, y: SPAWN.y + 2 };

const ABOVE_VOTING: Point = { x: VOTING.x, y: VOTING.y - 1 };

/** Inside the count's own bubble, in tiles: it is centred over the fixture and its
 * bottom sits on the fixture's head, so it hangs into the tile above. */
const COUNT = { x: VOTING.x + 0.5, y: VOTING.y - 0.4 };

async function legsAt(page: Page, tile: Point): Promise<string> {
  const point = spritePixel(tile, LEGS.sx, LEGS.sy);
  return (await pixelAtPoint(page, point.x, point.y)).join();
}

test("your own sprite draws over a friend standing lower, and they keep the painter's order between them", async ({
  page,
  browser,
}) => {
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("tester");
  expect(await legsAt(page, SPAWN)).toBe(DEFAULT_TROUSERS.join());

  const voter = await joinAs(browser, "voter");
  await walk(voter, "ArrowDown", BELOW.x, BELOW.y);
  await expect
    .poll(async () => legsAt(page, BELOW))
    .toBe(DEFAULT_TROUSERS.join());

  // The friend is one row lower, so the painter's order hands them the tile — and their
  // name would have taken your legs with it.
  expect(await legsAt(page, SPAWN)).toBe(DEFAULT_TROUSERS.join());

  const rival = await joinAs(browser, "rival");
  await walk(rival, "ArrowDown", BELOW.x, BELOW.y);
  await walk(rival, "ArrowDown", TWO_BELOW.x, TWO_BELOW.y);

  // Between two friends the order is untouched, so the lower one's name still covers
  // the higher one's legs.
  await expect
    .poll(async () => legsAt(page, BELOW))
    .not.toBe(DEFAULT_TROUSERS.join());
  expect(await legsAt(page, SPAWN)).toBe(DEFAULT_TROUSERS.join());

  await voter.context().close();
  await rival.context().close();
});

test("the voting NPC's count stands above the town and under the player", async ({
  page,
}) => {
  await apiUpload(page, "rival");
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("tester");

  // The count floats one row above the fixture wearing it, which is the tile the player
  // is about to stand on — and it IS drawn there: two tiles of the same plain grass,
  // and only one of them has a bubble over it.
  const bare = (await pixelAtPoint(page, COUNT.x + 1, COUNT.y)).join();
  await expect
    .poll(async () => (await pixelAtPoint(page, COUNT.x, COUNT.y)).join())
    .not.toBe(bare);

  await walk(page, "ArrowLeft", SPAWN.x - 1, SPAWN.y);
  await walk(page, "ArrowLeft", SPAWN.x - 2, SPAWN.y);
  await walk(page, "ArrowDown", SPAWN.x - 2, SPAWN.y + 1);
  await walk(page, "ArrowLeft", ABOVE_VOTING.x, ABOVE_VOTING.y);

  await expect
    .poll(async () => legsAt(page, ABOVE_VOTING))
    .toBe(DEFAULT_TROUSERS.join());
});
