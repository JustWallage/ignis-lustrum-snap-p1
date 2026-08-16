import type { Page } from "@playwright/test";
import { juryForDay } from "../shared/juries";
import {
  apiSignIn,
  apiUpload,
  boxOf,
  encloses,
  expect,
  filterBy,
  openArchive,
  operate,
  pressStart,
  reachPhase,
  readEvent,
  setDay,
  tapArrow,
  tapViewer,
  test,
  walkPodiumToWheel,
  walkToShelf,
  windowBox,
} from "./fixtures";

const EVENT_TIMEOUT_MS = 180_000;

const PHONE = { width: 390, height: 844 };

const DESKTOP = { width: 1280, height: 800 };

/** What `max-h-56` gave the old dialog, in pixels: the viewer's photograph has to beat
 * it on every viewport, which is the whole of #113. */
const OLD_PHOTO_MAX_H = 224;

/** `SnapViewer`'s own window, and the e2e project cannot import it from `src/`. Longer
 * here than there on purpose: the point is to be outside it. */
const DOUBLE_TAP_MS = 300;

function viewerTitle(page: Page, at: number, of: number) {
  return page
    .locator(".gb-window")
    .getByRole("heading", { name: `Snap ${at} of ${of}` });
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

test("the archive is a full-screen photo feed, and the jury signs every card", async ({
  page,
}) => {
  const mine = await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await setDay(page, 2);
  await apiUpload(page, "tester");
  await setDay(page, 3);
  await apiSignIn(page, "tester");

  const caption = "Still Life With Fluorescent Regret";
  const captioned = await page.request.post("/api/test/caption", {
    data: { photoId: mine, caption },
  });
  expect(captioned.ok()).toBeTruthy();

  await page.setViewportSize(PHONE);
  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await openArchive(page);

  const screen = await boxOf(page, "archive");
  expect(screen.width).toBeGreaterThan(PHONE.width - 40);
  expect(screen.height).toBeGreaterThan(PHONE.height - 40);

  const cards = page.getByTestId("archive-card");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("tester");
  await expect(cards.first()).toContainText("Day 2");

  const photo = await boxOf(page, "archive-photo");
  expect(photo.width).toBeGreaterThan(300);
  expect(photo.height).toBeGreaterThan(200);

  await expect(page.getByTestId("archive-days").getByRole("button")).toHaveText(
    ["All days", "Day 2", "Day 1"],
  );

  await filterBy(page, "archive-days", "All days");
  await expect(cards).toHaveCount(3);
  await expect(page.getByTestId("archive-results")).toContainText("rival");

  await filterBy(page, "archive-people", "rival");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Day 1");
  await expect(cards.first()).toContainText("rival");

  await filterBy(page, "archive-people", "Everyone");
  await filterBy(page, "archive-days", "Day 1");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Day 1");

  await filterBy(page, "archive-people", "tester");
  await expect(page.getByTestId("archive-caption")).toHaveText(caption);
  await expect(page.getByTestId("archive-jury")).toContainText(
    juryForDay(1).name,
  );

  const figures = page.getByTestId("archive-figures");
  await expect(figures).toBeHidden();
  await page
    .getByTestId("archive-card")
    .getByText(/points/)
    .click();
  await expect(figures).toContainText("Peer");
  await expect(figures).toContainText(/curved/i);
  await expect(page.getByTestId("archive-critique")).toContainText(/jury/i);
});

test("a card opens one big photograph over the archive, with the jury's line on it", async ({
  page,
}) => {
  const mine = await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await setDay(page, 2);
  await apiSignIn(page, "tester");

  const caption = "Two Chairs And A Long Wait";
  const captioned = await page.request.post("/api/test/caption", {
    data: { photoId: mine, caption },
  });
  expect(captioned.ok()).toBeTruthy();

  await page.setViewportSize(PHONE);
  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await openArchive(page);
  await filterBy(page, "archive-people", "tester");

  await page.getByTestId("archive-photo").click();
  await expect(viewerTitle(page, 1, 1)).toBeVisible();

  await expect(page.getByTestId("viewer-caption")).toHaveText(caption);
  await expect(page.getByTestId("viewer-who")).toHaveText("tester");
  const rating = page.getByTestId("viewer-rating");
  await expect(rating).toContainText("5/10");
  await expect(rating).toContainText("machine broke");
  await expect(page.getByTestId("comment-thread")).toBeVisible();

  const phoneWindow = await windowBox(page);
  expect(phoneWindow.height).toBeGreaterThan(PHONE.height - 40);
  const phonePhoto = await boxOf(page, "viewer-photo");
  expect(phonePhoto.height).toBeGreaterThan(OLD_PHOTO_MAX_H);
  expect(phonePhoto.height).toBeGreaterThan(PHONE.height / 2);
  expect(phonePhoto.width).toBeGreaterThan(phoneWindow.width - 60);
  await noSidewaysScroll(page);

  await page.setViewportSize(DESKTOP);
  const deskPhoto = await boxOf(page, "viewer-photo");
  expect(deskPhoto.height).toBeGreaterThan(DESKTOP.height / 2);
  // Comfortably past the old window's `max-w-sm` and past any phone width, without
  // pinning the assertion to `max-w-3xl` minus the window's padding.
  expect(deskPhoto.width).toBeGreaterThan(600);
  await noSidewaysScroll(page);

  const heart = page.locator(".gb-window").getByRole("button", { name: /♡|♥/ });
  await heart.click();
  await expect(heart).toContainText("♥ 1");

  await page.keyboard.press("Escape");
  await expect(viewerTitle(page, 1, 1)).toBeHidden();
  await expect(page.getByTestId("archive-results")).toBeVisible();
});

test("a snap the jury never wrote about shows no caption at all", async ({
  page,
}) => {
  await apiUpload(page, "rival");
  await setDay(page, 2);
  await apiSignIn(page, "tester");

  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await openArchive(page);

  await page.getByTestId("archive-photo").click();
  await expect(viewerTitle(page, 1, 1)).toBeVisible();
  // Positive first: the viewer IS the one on screen and it DID reach the verdict, so
  // the missing caption is the jury never writing one rather than an unfilled screen.
  await expect(page.getByTestId("viewer-rating")).toContainText("5/10");
  await expect(page.getByTestId("viewer-caption")).toHaveCount(0);
});

test("‹ ›, the arrow keys and the two tap zones all page the filtered feed", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await setDay(page, 2);
  await apiUpload(page, "tester");
  await setDay(page, 3);
  await apiSignIn(page, "tester");

  await page.setViewportSize(PHONE);
  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await openArchive(page);
  await filterBy(page, "archive-days", "All days");
  await expect(page.getByTestId("archive-card")).toHaveCount(3);

  await page.getByTestId("archive-photo").first().click();
  await expect(viewerTitle(page, 1, 3)).toBeVisible();

  await page.getByRole("button", { name: "Next snap" }).click();
  await expect(viewerTitle(page, 2, 3)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewerTitle(page, 3, 3)).toBeVisible();
  await tapViewer(page, "on");
  await expect(viewerTitle(page, 1, 3)).toBeVisible();
  await tapViewer(page, "back");
  await expect(viewerTitle(page, 3, 3)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(viewerTitle(page, 2, 3)).toBeVisible();
  await page.getByRole("button", { name: "Previous snap" }).click();
  await expect(viewerTitle(page, 1, 3)).toBeVisible();

  // Half the photograph each, and nothing outside it — measured off the picture's own
  // box, because a zone hanging over the controls would still call itself visible.
  const photo = await boxOf(page, "viewer-photo");
  for (const side of ["back", "on"] as const) {
    const zone = await boxOf(page, `viewer-tap-${side}`);
    expect(Math.abs(zone.width - photo.width / 2)).toBeLessThan(2);
    expect(Math.abs(zone.height - photo.height)).toBeLessThan(2);
    expect(zone.y).toBeGreaterThanOrEqual(photo.y - 1);
  }
  const back = await boxOf(page, "viewer-tap-back");
  const on = await boxOf(page, "viewer-tap-on");
  expect(on.x).toBeGreaterThan(back.x);

  const backArrow = await boxOf(page, "viewer-arrow-back");
  const onArrow = await boxOf(page, "viewer-arrow-on");
  expect(encloses(photo, backArrow)).toBe(true);
  expect(encloses(photo, onArrow)).toBe(true);
  expect(onArrow.x).toBeGreaterThan(backArrow.x);
  await tapArrow(page, "on");
  await expect(viewerTitle(page, 2, 3)).toBeVisible();
  await tapArrow(page, "back");
  await expect(viewerTitle(page, 1, 3)).toBeVisible();

  // The heart is under neither zone: it takes the tap and the page does not turn.
  const heart = page.locator(".gb-window").getByRole("button", { name: /♡|♥/ });
  await heart.click();
  await expect(heart).toContainText("♥ 1");
  await expect(viewerTitle(page, 1, 3)).toBeVisible();

  // TYPED, not filled: the arrows this viewer holds include A and D (`KEY_DIRS` reads
  // them as walking), and `fill` sets a value without pressing a key at all. The archive
  // is the surface where those keys are NEW, so the letters are asserted here.
  const field = page
    .getByTestId("comment-thread")
    .getByPlaceholder("Add a comment…");
  await field.pressSequentially("a dead ringer");
  await expect(field).toHaveValue("a dead ringer");
  await expect(viewerTitle(page, 1, 3)).toBeVisible();

  // And the half-written line does not travel: it belongs to the snap it was written
  // under, or it gets sent against a photograph nobody was looking at.
  await page.getByRole("button", { name: "Next snap" }).click();
  await expect(viewerTitle(page, 2, 3)).toBeVisible();
  await expect(field).toHaveValue("");

  await page.keyboard.press("Escape");
  await filterBy(page, "archive-days", "Day 1");
  await filterBy(page, "archive-people", "tester");
  await expect(page.getByTestId("archive-card")).toHaveCount(1);
  await page.getByTestId("archive-photo").click();
  await expect(viewerTitle(page, 1, 1)).toBeVisible();
  await tapViewer(page, "on");
  // Past the viewer's double-tap window, or the second tap cancels the first's page and
  // zooms the picture instead — two taps that never reached `step` say nothing about
  // paging a one-photograph list, which is what this pair is here for.
  await page.waitForTimeout(DOUBLE_TAP_MS);
  await tapViewer(page, "back");
  await expect(viewerTitle(page, 1, 1)).toBeVisible();
  await expect(page.getByTestId("viewer-who")).toHaveText("tester");
});

test("the shelf remembers what the wheel gave the winner", async ({ page }) => {
  test.setTimeout(EVENT_TIMEOUT_MS);
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await walkPodiumToWheel(page);

  await page.getByTestId("wheel-spin").click();
  await expect
    .poll(async () => (await readEvent(page)).prizeIndex)
    .not.toBeNull();
  const spun = await readEvent(page);
  const landed = spun.segments[spun.prizeIndex ?? -1];
  if (landed === undefined) throw new Error("the wheel landed on no segment");

  await expect(page.getByTestId("event-overlay")).toBeHidden({
    timeout: 30_000,
  });
  await expect(page.getByTestId("game-day")).toHaveText("DAY 2");

  await walkToShelf(page);
  await openArchive(page);
  await expect(page.getByTestId("archive-card")).toHaveCount(1);
  await expect(page.getByTestId("archive-prize")).toHaveText(`Won: ${landed}`);

  await page.getByTestId("archive-photo").click();
  await expect(viewerTitle(page, 1, 1)).toBeVisible();
  await expect(page.getByTestId("viewer-prize")).toHaveText(`Won: ${landed}`);
});

test("a day whose event was aborted shows no prize slot at all", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await reachPhase(page, "countdown");
  await operate(page, "Abort event", "Abort it");
  await expect(page.getByTestId("event-overlay")).toBeHidden();

  await setDay(page, 2);
  await walkToShelf(page);
  await openArchive(page);
  await expect(page.getByTestId("archive-card")).toHaveCount(1);
  await expect(page.getByTestId("archive-prize")).toHaveCount(0);
});

test("an empty archive says so, and a stranger cannot open one", async ({
  page,
}) => {
  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await expect(page.getByText(/sign in to read the archive/i)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".gb-window").getByRole("heading", { name: "Sign in" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await apiSignIn(page, "tester");
  await page.reload();
  await pressStart(page);
  await walkToShelf(page);
  await openArchive(page);
  await expect(page.getByTestId("archive-empty")).toContainText(
    /nothing is in the archive/i,
  );
});
