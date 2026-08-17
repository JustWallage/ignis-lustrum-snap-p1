import type { Page } from "@playwright/test";
import { juryForDay } from "../shared/juries";
import {
  apiSignIn,
  apiUpload,
  boxAround,
  boxOf,
  expect,
  hostNext,
  operate,
  overlaps,
  pressStart,
  reachPhase,
  readEvent,
  test,
  TODAY,
  type Box,
} from "./fixtures";

const EVENT_TIMEOUT_MS = 240_000;

/** LEAVES, because the scoreboard is a full-width `flex: 1` box and the crowd a
 * full-width positioning box: both would report a collision with any corner while
 * drawing nothing in it, and the rows and figures inside them are what a player would
 * actually see covered. */
async function inkInOverlay(page: Page): Promise<{ what: string; box: Box }[]> {
  return page.evaluate(() => {
    const overlay = document.querySelector(".gb-event");
    if (overlay === null) throw new Error("the event overlay is not on screen");
    return [...overlay.querySelectorAll("*")]
      .filter(
        (element) =>
          element.children.length === 0 &&
          !element.classList.contains("gb-jury-portrait"),
      )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          what: `${element.tagName}.${element.className}`,
          box: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        };
      })
      .filter((ink) => ink.box.width > 0 && ink.box.height > 0);
  });
}

async function expectWatching(page: Page, stage: string): Promise<void> {
  const portrait = page.getByTestId("jury-portrait");
  await expect(portrait, stage).toBeVisible();
  await expect(portrait, stage).toHaveAttribute("data-jury", TODAY.name);
  const box = await boxOf(page, "jury-portrait");
  const covered = await inkInOverlay(page);
  expect(
    covered.filter((ink) => overlaps(box, ink.box)).map((ink) => ink.what),
    `${stage}: the portrait is standing on these`,
  ).toEqual([]);
}

test("the jury watches every stage of the event and stands on none of it", async ({
  page,
}) => {
  test.setTimeout(EVENT_TIMEOUT_MS);
  for (const name of ["rival", "tester"] as const) {
    await apiUpload(page, name);
  }
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");

  await reachPhase(page, "countdown");
  await expectWatching(page, "countdown");

  await reachPhase(page, "reveal");
  await expect(page.getByTestId("reveal-photo")).toBeVisible({
    timeout: 60_000,
  });
  await expectWatching(page, "the parade");

  await expect(page.getByTestId("podium-place")).toBeVisible({
    timeout: 60_000,
  });
  await expectWatching(page, "the podium");

  let seenScoreboard = false;
  for (let step = 0; step < 6; step += 1) {
    const before = await readEvent(page);
    if (before.phase !== "reveal") break;
    await expect(page.getByTestId("podium-next")).toBeVisible({
      timeout: 60_000,
    });
    if (await page.getByTestId("scoreboard").isVisible()) {
      await expectWatching(page, "the scoreboard");
      seenScoreboard = true;
    }
    await hostNext(page);
    await expect
      .poll(
        async () => {
          const now = await readEvent(page);
          return now.phase !== "reveal" || now.podiumRank !== before.podiumRank;
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  }
  expect(seenScoreboard).toBe(true);

  await reachPhase(page, "wheel");
  await expectWatching(page, "the wheel");

  // Through the HOST's menu, not the winner's button: which of the two uploaders wins
  // the day is the scoring's business, and this spec has no stake in it.
  await operate(page, "Spin the wheel", "Spin it");
  await expect
    .poll(async () => (await readEvent(page)).prizeIndex, { timeout: 60_000 })
    .not.toBeNull();
  await expect(page.getByTestId("event-done")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("event-results")).toBeVisible();
  await expectWatching(page, "the last page");
});

test("the portrait is whichever jury the day landed on", async ({ page }) => {
  test.setTimeout(EVENT_TIMEOUT_MS);
  const later = juryForDay(4);
  expect(later.name).not.toBe(TODAY.name);

  await apiSignIn(page, "tester");
  const moved = await page.request.post("/api/test/reset", {
    data: { day: 4 },
  });
  expect(moved.ok()).toBeTruthy();

  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await reachPhase(page, "countdown");

  await expect(page.getByTestId("jury-portrait")).toHaveAttribute(
    "data-jury",
    later.name,
  );
});

test("on a shell too narrow for both, the portrait goes rather than the screen", async ({
  page,
}) => {
  test.setTimeout(EVENT_TIMEOUT_MS);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await reachPhase(page, "countdown");

  const portrait = page.getByTestId("jury-portrait");
  await expect(portrait).toBeVisible();
  const wide = await boxOf(page, "event-overlay");
  const dayWhenWide = await boxAround(page.locator(".gb-event-day"));
  expect(dayWhenWide.x + dayWhenWide.width / 2).toBeLessThan(
    wide.x + wide.width / 2 - 1,
  );

  await page.setViewportSize({ width: 360, height: 780 });
  await expect(portrait).toBeHidden();
  const narrow = await boxOf(page, "event-overlay");
  const dayWhenNarrow = await boxAround(page.locator(".gb-event-day"));
  expect(dayWhenNarrow.x + dayWhenNarrow.width / 2).toBeCloseTo(
    narrow.x + narrow.width / 2,
    0,
  );
});
