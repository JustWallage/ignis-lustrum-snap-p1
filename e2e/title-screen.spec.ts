import { SPAWN } from "../shared/map";
import {
  apiSignIn,
  expect,
  pressStart,
  setPhase,
  test,
  walk,
} from "./fixtures";

test("the title screen stands in front of every load", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("img", { name: "Title screen" })).toBeVisible();
  await expect(page.getByTestId("game-day")).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Walk right" }).click();
  await expect(page.getByTestId("player-pos")).toHaveAttribute(
    "data-x",
    String(SPAWN.x),
  );

  await page.keyboard.press("Enter");
  await expect(page.getByRole("img", { name: "Overworld" })).toBeVisible();
  await expect(page.getByTestId("game-day")).toHaveText("DAY 1");

  await walk(page, "ArrowRight", SPAWN.x + 1, SPAWN.y);
});

test("a signed-in title screen gathers the town, an anonymous one asks for nobody", async ({
  page,
}) => {
  const askedForRoster: string[] = [];
  const askedForClock: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/avatars")) askedForRoster.push(url);
    if (url.includes("/api/state")) askedForClock.push(url);
  });

  await apiSignIn(page);
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Title screen" })).toBeVisible();
  await expect(page.getByTestId("player-name")).toHaveText("tester");
  await expect.poll(() => askedForRoster.length).toBeGreaterThan(0);

  await page.context().clearCookies();
  await page.reload();
  await expect(page.getByRole("img", { name: "Title screen" })).toBeVisible();
  await expect(page.getByTestId("player-name")).toHaveCount(0);

  // Watched from zero rather than differenced against a count taken while signed in:
  // `useTownAvatars` reloads the roster on every content frame and the socket's greeting
  // delivers more than one, so a snapshot between them charges the anonymous half for
  // the signed-in half's requests. The reload above drains those; this load counts.
  askedForRoster.length = 0;
  askedForClock.length = 0;
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Title screen" })).toBeVisible();
  await expect(page.getByTestId("player-name")).toHaveCount(0);
  await pressStart(page);
  await walk(page, "ArrowRight", SPAWN.x + 1, SPAWN.y);

  await expect.poll(() => askedForClock.length).toBeGreaterThan(0);
  expect(askedForRoster).toEqual([]);
});

test("a live event already running skips the title screen", async ({
  page,
}) => {
  await apiSignIn(page);
  await setPhase(page, "countdown");
  await page.context().clearCookies();

  await page.goto("/");
  await expect(page.getByTestId("event-overlay")).toBeVisible();
  await expect(page.getByRole("img", { name: "Live event" })).toBeVisible();
  const start = page.getByTestId("start-button");
  await expect(start).toBeDisabled();
  await expect(start).toHaveAttribute(
    "aria-label",
    "Start — unavailable during the event",
  );
});

test("START is a round trip to the title screen and back", async ({ page }) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("tester");

  await walk(page, "ArrowRight", SPAWN.x + 1, SPAWN.y);

  const start = page.getByTestId("start-button");
  await expect(start).toHaveAttribute("aria-label", "Start — back to title");
  await start.click();
  await expect(page.getByRole("img", { name: "Title screen" })).toBeVisible();

  await expect(page.getByTestId("player-name")).toHaveText("tester");
  await expect(page.getByTestId("game-day")).toBeHidden();

  await expect(start).toHaveAttribute("aria-label", "Start — begin");
  await start.click();
  await expect(page.getByRole("img", { name: "Overworld" })).toBeVisible();
  await expect(page.getByTestId("game-day")).toHaveText("DAY 1");
  const pos = page.getByTestId("player-pos");
  await expect(pos).toHaveAttribute("data-x", String(SPAWN.x + 1));
  await expect(pos).toHaveAttribute("data-y", String(SPAWN.y));

  await page.getByTestId("select-button").click();
  await expect(page.getByTestId("dialogue-choices")).toBeVisible();
  await start.click();
  await expect(page.getByRole("img", { name: "Title screen" })).toBeVisible();
  await expect(page.getByTestId("dialogue-choices")).toBeHidden();
});
