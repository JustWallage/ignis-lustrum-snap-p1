import { SPAWN } from "../shared/map";
import { gameStateSchema } from "../shared/state";
import { apiSignIn, expect, operate, pressStart, test } from "./fixtures";

test("an admin starts the event, and a screen that joins late is already in it", async ({
  page,
  browser,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("game-day")).toHaveText("DAY 1");

  await operate(page, "Start event", "Start it");

  const overlay = page.getByTestId("event-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-phase", "countdown");
  await expect(page.getByTestId("game-day")).toBeHidden();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("player-pos")).toHaveAttribute(
    "data-x",
    String(SPAWN.x),
  );

  // Which PHASE it lands in is deliberately NOT asserted: the event runs itself off the
  // DO's alarms, so a fresh context may boot into the reveal. This is about the state
  // being authoritative; `countdown` and `live-loop` pin the phases down.
  const other = await browser.newContext();
  const late = await other.newPage();
  await late.goto("/");
  await expect(late.getByTestId("event-overlay")).toBeVisible();
  await expect(late.getByRole("img", { name: "Live event" })).toBeVisible();
  await other.close();

  await operate(page, "Abort event", "Abort it");
  await expect(overlay).toBeHidden();
  await expect(page.getByTestId("game-day")).toHaveText("DAY 1");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("player-pos")).toHaveAttribute(
    "data-x",
    String(SPAWN.x + 1),
  );

  const state = await page.request.get("/api/state");
  expect(gameStateSchema.parse(await state.json())).toMatchObject({
    day: 1,
    phase: "submission",
  });
});

test("the operator's buttons are not in everyone else's menu", async ({
  page,
}) => {
  await page.goto("/");
  await pressStart(page);

  await page.getByTestId("select-button").click();
  const choices = page.getByTestId("dialogue-choices");
  await expect(
    choices.getByRole("button", { name: "Install app" }),
  ).toBeVisible();
  await expect(
    choices.getByRole("button", { name: "Start event" }),
  ).toBeHidden();
  await expect(
    choices.getByRole("button", { name: "Abort event" }),
  ).toBeHidden();

  expect((await page.request.post("/api/admin/event/start")).status()).toBe(
    401,
  );
});
