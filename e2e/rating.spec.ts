import type { Page } from "@playwright/test";
import { HALF_WEIGHT } from "../shared/scoring";
import {
  apiSignIn,
  apiUpload,
  expect,
  hostNext,
  INK,
  operate,
  pressStart,
  reachPhase,
  reachPodium,
  reachScoreboard,
  setDay,
  test,
  USERS,
  walkToShelf,
} from "./fixtures";

// `aiScore` is the rating (1-10); `aiNorm` is the day's CURVED half (0-50, top value
// always exactly HALF_WEIGHT), which is what used to be printed under a bare "AI".
//
// With no GEMINI_API_KEY every verdict here is the fallback — score 5, `failed` — so the
// rating reads 5/10 while the curve reads 50: exactly the pair that was
// indistinguishable. A real answer changes the numerator and nothing else.

const EVENT_TIMEOUT_MS = 240_000;

const FALLBACK_RATING = "5/10";

const CURVED = `CURVED ${String(HALF_WEIGHT)}`;

async function aDay(
  page: Page,
  who: readonly (keyof typeof USERS)[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const name of who) ids.push(await apiUpload(page, name));
  for (const [at, name] of who.entries()) {
    await apiSignIn(page, name);
    const res = await page.request.put("/api/votes", {
      data: { photoIds: ids.filter((_id, index) => index !== at) },
    });
    expect(res.ok()).toBeTruthy();
  }
  return ids;
}

test("the podium prints the jury's rating, and says which number is the curve", async ({
  page,
}) => {
  test.setTimeout(EVENT_TIMEOUT_MS);
  await aDay(page, ["tester", "rival"]);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await reachPodium(page, "2ND");

  const rating = page.getByTestId("podium-rating");
  await expect(rating).toContainText(FALLBACK_RATING);
  await expect(rating).not.toContainText(String(HALF_WEIGHT));
  await expect(rating).toContainText(/machine broke/i);

  const score = page.getByTestId("podium-score");
  await expect(score).toContainText(CURVED);

  await expect(score.getByText(/^PEER/)).toHaveCSS("color", INK.peerOnDark);
  await expect(score.getByText(CURVED)).toHaveCSS("color", INK.juryOnDark);
  await expect(rating).toHaveCSS("color", INK.juryOnDark);
  await expect(rating.locator("span")).toHaveCSS("color", INK.juryOnDark);
  await expect(score.getByText(/^=/)).toHaveCSS("color", INK.untintedOnDark);
});

test("the reveal ends on a scoreboard of everybody, and the host takes it to the wheel", async ({
  page,
}) => {
  test.setTimeout(EVENT_TIMEOUT_MS);
  const who = ["tester", "rival", "voter", "judge"] as const;
  await aDay(page, who);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");

  let podiumJury = "";
  for (const place of ["3RD", "2ND", "1ST"]) {
    await reachPodium(page, place);
    // Read inside the loop: the scoreboard stage replaces the podium card, so this
    // colour is unreadable by the time the rows below are asserted against it.
    podiumJury = await page
      .getByTestId("podium-rating")
      .evaluate((node) => getComputedStyle(node).color);
    await hostNext(page);
  }
  await reachScoreboard(page);
  expect(podiumJury).toBe(INK.juryOnDark);

  const rows = page.getByTestId("scoreboard-row");
  await expect(rows).toHaveCount(who.length);
  for (const name of who) {
    await expect(page.getByTestId("scoreboard")).toContainText(
      name.toUpperCase(),
    );
  }
  await expect(rows.first()).toContainText("#1");
  await expect(rows.last()).toContainText(`#${String(who.length)}`);
  await expect(rows.first()).toContainText("PEER");
  await expect(rows.first()).toContainText(CURVED);
  await expect(page.getByTestId("scoreboard-rating").first()).toContainText(
    FALLBACK_RATING,
  );
  await expect(page.getByTestId("scoreboard-note")).toBeVisible();

  await expect(rows.first().getByText(/^PEER/)).toHaveCSS(
    "color",
    INK.peerOnDark,
  );
  await expect(rows.first().getByText(CURVED)).toHaveCSS(
    "color",
    INK.juryOnDark,
  );
  await expect(page.getByTestId("scoreboard-rating").first()).toHaveCSS(
    "color",
    podiumJury,
  );
  await expect(page.getByTestId("scoreboard-note")).toHaveCSS(
    "color",
    podiumJury,
  );
  await expect(rows.first().getByText(/^\d+$/)).toHaveCSS(
    "color",
    INK.untintedOnDark,
  );

  await expect(page.getByTestId("podium-next")).toBeVisible();
  await hostNext(page);
  await reachPhase(page, "wheel");
});

test("the scoreboard is readable at mobile width with the day's whole field", async ({
  page,
}) => {
  test.setTimeout(EVENT_TIMEOUT_MS);
  const who = ["tester", "rival", "voter", "judge"] as const;
  await aDay(page, who);
  await apiSignIn(page, "tester");
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  for (const place of ["3RD", "2ND", "1ST"]) {
    await reachPodium(page, place);
    await hostNext(page);
  }
  await reachScoreboard(page);

  const board = page.getByTestId("scoreboard");
  const rows = page.getByTestId("scoreboard-row");
  await expect(rows).toHaveCount(who.length);
  for (let at = 0; at < who.length; at += 1) {
    const row = rows.nth(at);
    await expect(row).toBeVisible();
    const box = await row.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(8);
  }
  const overflow = await board.evaluate(
    (node) => getComputedStyle(node).overflowY,
  );
  expect(overflow).toBe("auto");
  const spill = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(spill).toBe(false);
});

test("the rating survives the reveal: it is in the archive and on the snap", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await setDay(page, 2);
  await apiSignIn(page, "tester");

  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("archive")).toBeVisible();

  const card = page.getByTestId("archive-card").first();
  await expect(card.getByTestId("archive-rating")).toContainText(
    FALLBACK_RATING,
  );
  await expect(card.getByTestId("archive-rating")).toHaveCSS(
    "color",
    INK.juryOnLight,
  );
  await card.getByText(/points/).click();
  const figures = card.getByTestId("archive-figures");
  await expect(figures).toContainText(/curved/i);
  await expect(figures.getByText(/^Peer/)).toHaveCSS("color", INK.peerOnLight);
  await expect(figures.getByText(/^CURVED/)).toHaveCSS(
    "color",
    INK.juryOnLight,
  );
  await expect(figures.getByText(/^Rank/)).toHaveCSS(
    "color",
    INK.untintedOnLight,
  );

  await card.getByTestId("archive-photo").click();
  await expect(page.getByTestId("viewer-rating")).toContainText(
    FALLBACK_RATING,
  );
  await expect(page.getByTestId("viewer-rating")).toHaveCSS(
    "color",
    INK.juryOnLight,
  );
});

test("no rating anywhere before the day is revealed, your own snap included", async ({
  page,
}) => {
  const mine = await apiUpload(page, "tester");
  await apiSignIn(page, "tester");

  const own = await page.request.get(`/api/photos/${String(mine)}`);
  expect(own.ok()).toBeTruthy();
  expect(await own.json()).toMatchObject({ aiScore: null });

  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await reachPhase(page, "reveal");
  const revealed = await page.request.get(`/api/photos/${String(mine)}`);
  expect(await revealed.json()).toMatchObject({ aiScore: 5 });
});
