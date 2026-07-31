import { juryForDay } from "../shared/juries";
import { JURY } from "../shared/map";
import {
  apiSignIn,
  expect,
  spriteAt,
  pressStart,
  test,
  TODAY,
  walkToJury,
} from "./fixtures";

test("the day decides which jury stands by the pond", async ({ page }) => {
  const later = juryForDay(4);
  expect(later.name).not.toBe(TODAY.name);

  await apiSignIn(page);
  const moved = await page.request.post("/api/test/reset", {
    data: { day: 4 },
  });
  expect(moved.ok()).toBeTruthy();

  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 4");
  await expect(page.getByTestId("game-theme")).toHaveText(
    later.theme.toUpperCase(),
  );

  await walkToJury(page);
  await expect(
    page.getByText(new RegExp(`talk to ${later.name}`, "i")),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toContainText(
    later.name.toUpperCase(),
  );
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("dialogue-text")).toBeHidden();
});

test("the schedule wraps: day 15 puts jury one back by the pond", async ({
  page,
}) => {
  expect(juryForDay(15).name).toBe(TODAY.name);
  expect(juryForDay(4).name).not.toBe(TODAY.name);

  await page.goto("/");
  await pressStart(page);
  const dayOne = await spriteAt(page, JURY.x, JURY.y);

  await apiSignIn(page);
  const toDayFour = await page.request.post("/api/test/reset", {
    data: { day: 4 },
  });
  expect(toDayFour.ok()).toBeTruthy();
  await expect(page.getByTestId("game-day")).toHaveText("DAY 4");
  expect(await spriteAt(page, JURY.x, JURY.y)).not.toEqual(dayOne);

  const toDayFifteen = await page.request.post("/api/test/reset", {
    data: { day: 15 },
  });
  expect(toDayFifteen.ok()).toBeTruthy();
  await expect(page.getByTestId("game-day")).toHaveText("DAY 15");
  await expect(page.getByTestId("game-theme")).toHaveText(
    TODAY.theme.toUpperCase(),
  );
  expect(await spriteAt(page, JURY.x, JURY.y)).toEqual(dayOne);
});
