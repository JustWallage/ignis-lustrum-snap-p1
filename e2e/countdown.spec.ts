import type { Page } from "@playwright/test";
import { eventStateSchema } from "../shared/events";
import { gameStateSchema } from "../shared/state";
import {
  apiSignIn,
  expect,
  operate,
  pressStart,
  recordAudio,
  setPhase,
  test,
  voices,
} from "./fixtures";

const SECONDS = "countdown-seconds";

async function startCountdown(page: Page): Promise<number> {
  await operate(page, "Start event", "Start it");
  await expect(page.getByTestId("event-overlay")).toHaveAttribute(
    "data-phase",
    "countdown",
  );
  const { countdownEndsAt } = eventStateSchema.parse(
    await (await page.request.get("/api/event")).json(),
  );
  if (countdownEndsAt === null) {
    throw new Error("the countdown was started without a target");
  }
  return countdownEndsAt;
}

async function join(page: Page, at?: number) {
  if (at !== undefined) await page.clock.setFixedTime(at);
  await page.goto("/");
  await expect(page.getByTestId("event-overlay")).toHaveAttribute(
    "data-phase",
    "countdown",
  );
}

test("two screens read the same second off one absolute target", async ({
  page,
  browser,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  const endsAt = await startCountdown(page);

  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await apiSignIn(friend, "rival");
  await join(friend);

  for (const screen of [page, friend]) {
    await screen.clock.setFixedTime(endsAt - 7_000);
  }
  await expect(page.getByTestId(SECONDS)).toHaveText("7");
  await expect(friend.getByTestId(SECONDS)).toHaveText("7");

  for (const screen of [friend, page]) {
    await screen.clock.setFixedTime(endsAt - 2_400);
  }
  await expect(friend.getByTestId(SECONDS)).toHaveText("3");
  await expect(page.getByTestId(SECONDS)).toHaveText("3");
  await expect(page.getByTestId("event-overlay")).toContainText(
    "THE JUDGING BEGINS IN",
  );

  await friendContext.close();
});

test("a screen joining at t-3s sees three, not ten", async ({
  page,
  browser,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  const endsAt = await startCountdown(page);

  // Pinned BEFORE the first paint, so what this screen shows is what it worked
  // out from the snapshot it was handed on connect — not a ten it started at and
  // would have counted down from wherever it happened to open.
  const lateContext = await browser.newContext();
  const late = await lateContext.newPage();
  await join(late, endsAt - 3_000);
  await expect(late.getByTestId(SECONDS)).toHaveText("3");

  await expect(late.getByRole("img", { name: "Live event" })).toBeVisible();
  await lateContext.close();
});

test("a screen whose clock has run out waits, rather than advancing itself", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  const endsAt = await startCountdown(page);

  // This screen's clock is PAST the target while the server's is not — the only way to
  // ask the question. The digit stops at zero and the phase does not move.
  await page.clock.setFixedTime(endsAt + 5_000);
  await expect(page.getByTestId(SECONDS)).toHaveText("0");
  await expect(page.getByTestId("event-overlay")).toContainText(
    "THE JURY IS DECIDING",
  );
  await expect(page.getByTestId("event-overlay")).toHaveAttribute(
    "data-phase",
    "countdown",
  );
  await expect(page.getByTestId("game-day")).toBeHidden();
  const state = await page.request.get("/api/state");
  expect(gameStateSchema.parse(await state.json())).toMatchObject({
    day: 1,
    phase: "countdown",
  });
});

test("the digits fall on their own, and tick as they go", async ({ page }) => {
  await recordAudio(page);
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await startCountdown(page);

  const digits = page.getByTestId(SECONDS);
  const opening = Number(await digits.textContent());
  expect(opening).toBeGreaterThan(0);
  expect(opening).toBeLessThanOrEqual(10);

  const before = (await voices(page)).length;
  await expect
    .poll(async () => Number(await digits.textContent()))
    .toBeLessThan(opening);
  await expect
    .poll(async () => (await voices(page)).length, { timeout: 8_000 })
    .toBeGreaterThanOrEqual(before + 3);
});

test("the countdown hands over to the reveal without anyone pressing anything", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await startCountdown(page);

  await expect(page.getByTestId("event-overlay")).toHaveAttribute(
    "data-phase",
    "reveal",
    { timeout: 30_000 },
  );
});

test("a countdown with no target counts nothing rather than counting wrong", async ({
  page,
}) => {
  await apiSignIn(page);
  await setPhase(page, "countdown");
  await page.goto("/");
  await expect(page.getByTestId(SECONDS)).toHaveText("-");
});
