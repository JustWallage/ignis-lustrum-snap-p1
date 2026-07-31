import { SHELF, SPAWN, TROPHY, VOTING } from "../shared/map";
import {
  expect,
  pixelAt,
  pressStart,
  test,
  TODAY,
  walk,
  walkToVotingNpc,
} from "./fixtures";

test("walks the overworld without signing in", async ({ page }) => {
  await page.goto("/");
  await pressStart(page);
  const pos = page.getByTestId("player-pos");
  await expect(pos).toHaveAttribute("data-x", String(SPAWN.x));
  await expect(pos).toHaveAttribute("data-y", String(SPAWN.y));

  await expect(page.getByTestId("game-day")).toHaveText("DAY 1");
  await expect(page.getByTestId("game-theme")).toHaveText(
    TODAY.theme.toUpperCase(),
  );

  await walk(page, "ArrowRight", SPAWN.x + 1, SPAWN.y);
  await walk(page, "ArrowUp", SPAWN.x + 1, SPAWN.y - 1);
});

test("the archive house is visible from outside and reached through its door", async ({
  page,
}) => {
  await page.goto("/");
  await pressStart(page);

  const floor = await pixelAt(page, 2, 1);
  const roof = await pixelAt(page, 0, 0);
  const grass = await pixelAt(page, 6, 4);
  const trees = await pixelAt(page, 0, 8);
  expect(floor).not.toEqual(grass);
  expect(floor).not.toEqual(trees);
  expect(roof).not.toEqual(floor);
  expect(roof).not.toEqual(trees);

  await walk(page, "ArrowLeft", 3, SPAWN.y);
  await walk(page, "ArrowLeft", 2, SPAWN.y);

  await walk(page, "ArrowUp", 2, 2);

  // Inside, every wall holds. Each bump is proved by the move after it landing
  // where it would have from the un-bumped tile.
  await walk(page, "ArrowUp", 2, 1);
  await walk(page, "ArrowRight", 2, 1); // the archive shelf is solid
  await walk(page, "ArrowLeft", 2, 1); // ...and so is the trophy, in the corner
  await walk(page, "ArrowUp", 2, 1); // the roof caps the room
  await walk(page, "ArrowDown", 2, 2);
  await walk(page, "ArrowLeft", 1, 2);
  await walk(page, "ArrowLeft", 1, 2); // the west side wall
  await walk(page, "ArrowUp", 1, 2); // the trophy again, from below
  await walk(page, "ArrowDown", 1, 2); // the front wall, beside the door
  await walk(page, "ArrowRight", 2, 2);
  await walk(page, "ArrowRight", 3, 2);
  await walk(page, "ArrowRight", 3, 2); // the east side wall
  await walk(page, "ArrowUp", 3, 2); // the shelf again, from below

  await walk(page, "ArrowLeft", 2, 2);
  await walk(page, "ArrowDown", 2, 4);
});

test("the archive room holds both fixtures, and both are readable from inside", async ({
  page,
}) => {
  await page.goto("/");
  await pressStart(page);

  await walk(page, "ArrowLeft", 3, SPAWN.y);
  await walk(page, "ArrowLeft", 2, SPAWN.y);
  await walk(page, "ArrowUp", 2, 2);

  await walk(page, "ArrowUp", SHELF.x - 1, SHELF.y);
  await walk(page, "ArrowRight", SHELF.x - 1, SHELF.y);
  await expect(page.getByText(/read the archive/i)).toBeVisible();
  await walk(page, "ArrowLeft", TROPHY.x + 1, TROPHY.y);
  await expect(page.getByText(/see the champion/i)).toBeVisible();

  await walk(page, "ArrowDown", TROPHY.x + 1, TROPHY.y + 1);
  await walk(page, "ArrowLeft", TROPHY.x, TROPHY.y + 1);
  await walk(page, "ArrowUp", TROPHY.x, TROPHY.y + 1);
  await expect(page.getByText(/see the champion/i)).toBeVisible();
});

test("the voting NPC stands off the path, and the tile they left is walkable", async ({
  page,
}) => {
  await page.goto("/");
  await pressStart(page);

  await walkToVotingNpc(page);
  const pos = page.getByTestId("player-pos");
  await expect(pos).toHaveAttribute("data-x", String(VOTING.x + 1));
  await expect(pos).toHaveAttribute("data-y", String(VOTING.y));
});
