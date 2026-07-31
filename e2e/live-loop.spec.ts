import type { Browser, Page } from "@playwright/test";
import { apiErrorSchema, prizeListSchema } from "../shared/api";
import { PARADE_MS, WHEEL_SPIN_MS } from "../shared/events";
import { juryForDay } from "../shared/juries";
import { SPAWN } from "../shared/map";
import { gameStateSchema } from "../shared/state";
import {
  apiSignIn,
  apiUpload,
  expect,
  hostNext,
  operate,
  pressStart,
  reachPhase,
  readEvent,
  recordAudio,
  reachScoreboard,
  walkPodiumToWheel,
  test,
  USERS,
  voices,
} from "./fixtures";

const LOOP_TIMEOUT_MS = 240_000;

async function friendScreen(
  browser: Browser,
  name: keyof typeof USERS,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await apiSignIn(page, name);
  return page;
}

test("three friends walk one live event from countdown to the next day", async ({
  page,
  browser,
}) => {
  test.setTimeout(LOOP_TIMEOUT_MS);

  const mine = await apiUpload(page, "tester");
  const theirs = await apiUpload(page, "rival");
  const third = await apiUpload(page, "voter");
  for (const [who, ballot] of [
    ["tester", [theirs, third]],
    ["rival", [mine, third]],
    ["voter", [mine, theirs]],
  ] as const) {
    await apiSignIn(page, who);
    const res = await page.request.put("/api/votes", {
      data: { photoIds: ballot },
    });
    expect(res.ok()).toBeTruthy();
  }

  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  const rival = await friendScreen(browser, "rival");
  const voter = await friendScreen(browser, "voter");
  await rival.goto("/");
  await voter.goto("/");
  await pressStart(rival);
  await pressStart(voter);

  await operate(page, "Start event", "Start it");

  const screens = [page, rival, voter];
  for (const screen of screens) await reachPhase(screen, "countdown");

  // Asserted BEFORE any clock is pinned: a negative assertion tangled up with a fake
  // clock is one that can fail for reasons it is not about.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("player-pos")).toHaveAttribute(
    "data-x",
    String(SPAWN.x),
  );

  const started = await readEvent(page);
  const endsAt = started.countdownEndsAt;
  if (endsAt === null) throw new Error("the countdown has no target");
  for (const screen of screens) {
    await screen.clock.setFixedTime(endsAt - 4_000);
  }
  for (const screen of screens) {
    await expect(screen.getByTestId("countdown-seconds")).toHaveText("4");
  }
  // `setSystemTime`, not `setFixedTime`: the latter FREEZES the clock and never leaves
  // the parade it was pinned inside. Everything after this is the event running itself.
  for (const screen of screens) await screen.clock.setSystemTime(Date.now());

  for (const screen of screens) await reachPhase(screen, "reveal");

  const reveal = await readEvent(page);
  expect(reveal.revealPhotoIds).toHaveLength(3);
  expect(reveal.revealPhotoIds.at(-1)).toBe(reveal.winnerPhotoId);
  const revealStartedAt = reveal.revealStartedAt;
  if (revealStartedAt === null) throw new Error("the reveal has no start");

  // One snap per PARADE_MS, the same snap on every screen at the same moment.
  // Pinned clocks rather than sleeps: this is what "each shown for 1.5s" means,
  // and a sleep would only ever say "it changed at some point".
  for (const [at, expected] of reveal.revealPhotoIds.entries()) {
    for (const screen of screens) {
      await screen.clock.setFixedTime(revealStartedAt + at * PARADE_MS + 700);
    }
    for (const screen of screens) {
      await expect(screen.getByTestId("reveal-photo")).toHaveAttribute(
        "data-photo-id",
        String(expected),
      );
    }
    await expect(page.getByTestId("reveal-progress")).toHaveText(
      `${String(at + 1)}/3`,
    );
  }

  for (const screen of screens) await screen.clock.setSystemTime(Date.now());
  for (const screen of screens) {
    await expect(screen.getByTestId("podium-place")).toHaveText("3RD PLACE", {
      timeout: 60_000,
    });
  }
  await expect(page.getByTestId("podium-next")).toBeVisible();
  for (const screen of [rival, voter]) {
    await expect(screen.getByTestId("podium-next")).toBeHidden();
    await expect(screen.getByTestId("podium-waiting")).toBeVisible();
  }

  for (const place of ["3RD", "2ND", "1ST"]) {
    for (const screen of screens) {
      await expect(screen.getByTestId("podium-place")).toHaveText(
        `${place} PLACE`,
        { timeout: 60_000 },
      );
      await expect(screen.getByTestId("podium-name")).not.toBeEmpty();
      await expect(screen.getByTestId("podium-score")).toContainText("=");
    }
    if (place !== "1ST") await hostNext(page);
  }
  await expect(page.getByTestId("podium-next")).toBeVisible();

  const named = await page.getByTestId("podium-name").textContent();
  for (const screen of screens) {
    await expect(screen.getByTestId("podium-name")).toHaveText(named ?? "");
  }
  const results = await page.request.get("/api/days/1/results");
  expect(results.status()).toBe(200);

  await hostNext(page);
  for (const screen of screens) {
    await reachScoreboard(screen);
    await expect(screen.getByTestId("scoreboard-row")).toHaveCount(3);
  }

  await hostNext(page);
  for (const screen of screens) await reachPhase(screen, "wheel");

  const wheel = await readEvent(page);
  expect(wheel.segments.length).toBeGreaterThan(1);
  const spinners = [];
  for (const screen of screens) {
    if (await screen.getByTestId("wheel-spin").isVisible())
      spinners.push(screen);
  }
  expect(spinners).toHaveLength(1);
  const winnerScreen = spinners[0];
  if (winnerScreen === undefined)
    throw new Error("nobody could spin the wheel");
  for (const screen of screens.filter((s) => s !== winnerScreen)) {
    await expect(screen.getByTestId("wheel")).toBeVisible();
    await expect(screen.getByTestId("wheel-spin")).toBeHidden();
  }

  await winnerScreen.getByTestId("wheel-spin").click();

  await expect
    .poll(async () => (await readEvent(page)).prizeIndex)
    .not.toBeNull();
  const spun = await readEvent(page);
  const spunAt = spun.spunAt;
  if (spunAt === null) throw new Error("the wheel was not spun");
  const landed = spun.segments[spun.prizeIndex ?? 0];
  for (const screen of screens) {
    await screen.clock.setFixedTime(spunAt + WHEEL_SPIN_MS + 200);
  }
  for (const screen of screens) {
    await expect(screen.getByTestId("wheel-prize")).toHaveText(
      (landed ?? "").toUpperCase(),
    );
  }

  for (const screen of screens) await screen.clock.setSystemTime(Date.now());
  for (const screen of screens) {
    await expect(screen.getByTestId("event-overlay")).toBeHidden({
      timeout: 60_000,
    });
    await expect(screen.getByTestId("game-day")).toHaveText("DAY 2");
    await expect(screen.getByTestId("game-theme")).toHaveText(
      juryForDay(2).theme.toUpperCase(),
    );
  }

  // The assertion that caught a real one: a direction pressed during the countdown was
  // QUEUED, so handing the world back lurched the player a tile untouched.
  await expect(page.getByTestId("player-pos")).toHaveAttribute(
    "data-x",
    String(SPAWN.x),
  );

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("player-pos")).toHaveAttribute(
    "data-x",
    String(SPAWN.x + 1),
  );
  const state = await page.request.get("/api/state");
  expect(gameStateSchema.parse(await state.json())).toMatchObject({
    day: 2,
    phase: "submission",
    submissionCount: 0,
  });

  await rival.context().close();
  await voter.context().close();
});

test("a screen that joins mid-reveal joins the parade where it is", async ({
  page,
  browser,
}) => {
  test.setTimeout(LOOP_TIMEOUT_MS);
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");

  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await reachPhase(page, "reveal");

  const reveal = await readEvent(page);
  const startedAt = reveal.revealStartedAt;
  if (startedAt === null) throw new Error("the reveal has no start");

  // Pinned to the second snap's slot BEFORE its first paint: what it shows is
  // what it worked out from the reveal's absolute start, not the beginning of a
  // parade it never saw the beginning of.
  const late = await friendScreen(browser, "voter");
  await late.clock.setFixedTime(startedAt + PARADE_MS + 500);
  await late.goto("/");
  await expect(late.getByTestId("reveal-progress")).toHaveText("2/2");
  await expect(late.getByTestId("reveal-photo")).toHaveAttribute(
    "data-photo-id",
    String(reveal.revealPhotoIds[1]),
  );
  await late.context().close();
});

test("an anonymous walker sees the event but not the snaps in it", async ({
  page,
}) => {
  test.setTimeout(LOOP_TIMEOUT_MS);
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await reachPhase(page, "reveal");

  await page.context().clearCookies();
  await page.reload();
  await expect(page.getByTestId("event-overlay")).toBeVisible();
  await expect(page.getByTestId("event-overlay")).toContainText("SIGN IN");
  await expect(page.getByTestId("reveal-photo")).toBeHidden();
  expect((await page.request.get("/api/days/1/results")).status()).toBe(401);
});

test("the wheel refuses to open an event it could not finish", async ({
  page,
}) => {
  await apiSignIn(page, "tester");
  const listed = await page.request.get("/api/prizes");
  const { prizes } = prizeListSchema.parse(await listed.json());
  for (const prize of prizes.slice(1)) {
    const off = await page.request.patch(`/api/prizes/${String(prize.id)}`, {
      data: { enabled: false },
    });
    expect(off.ok()).toBeTruthy();
  }

  // A negative needs something positive behind it: pressing the button and checking
  // nothing happened passes just as happily against a request that never landed.
  const refused = await page.request.post("/api/admin/event/start");
  expect(refused.status()).toBe(409);
  expect(apiErrorSchema.parse(await refused.json()).error).toMatch(/prizes/i);

  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await expect(page.getByTestId("event-overlay")).toBeHidden();
  await expect(page.getByTestId("game-day")).toHaveText("DAY 1");
  expect((await readEvent(page)).phase).toBe("submission");
});

test("the wheel ticks as it turns and cheers when it lands", async ({
  page,
}) => {
  test.setTimeout(LOOP_TIMEOUT_MS);
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  await recordAudio(page);
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await walkPodiumToWheel(page);

  const before = (await voices(page)).length;
  await page.getByTestId("wheel-spin").click();
  await expect
    .poll(async () => (await voices(page)).length, { timeout: 15_000 })
    .toBeGreaterThan(before + 5);
  await expect(page.getByTestId("wheel-prize")).toBeVisible({
    timeout: 15_000,
  });
});
