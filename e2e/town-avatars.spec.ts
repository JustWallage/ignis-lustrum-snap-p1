import type { Locator, Page } from "@playwright/test";
import { JURIES } from "../shared/juries";
import { MAP_W } from "../shared/map";
import {
  apiSignIn,
  apiStoreAvatar,
  expect,
  lcd,
  operate,
  pressStart,
  reachPhase,
  setDay,
  test,
  walkToShelf,
} from "./fixtures";

/** The worst case for the badge the avatar takes width from, read off the data rather
 * than named, so a new jury is covered by the day it is added. */
const WORST_THEME = JURIES.reduce(
  (worst, jury, index) =>
    jury.theme.length > worst.theme.length
      ? { theme: jury.theme, day: index + 1 }
      : worst,
  { theme: "", day: 1 },
);

const PHONE = { width: 390, height: 844 };

/** Narrower than PHONE: the archive is a modern full-screen sheet, so its own bar is
 * measured against the smallest shell anybody carries, not against the LCD's. */
const NARROW = { width: 375, height: 667 };

const DESKTOP = { width: 1280, height: 900 };

const AVATAR_SHARE = 3 / MAP_W;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(target: Locator): Promise<Box> {
  const box = await target.boundingBox();
  if (box === null) throw new Error("that element is not on screen");
  return box;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function encloses(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.width <= outer.x + outer.width + 1 &&
    inner.y + inner.height <= outer.y + outer.height + 1
  );
}

/**
 * Every claim about the badge measured against the LCD's own box, never a pixel count:
 * the shell is sized off the viewport, so no number here survives a second window size.
 * The CORNER as well as the size — `width` and `aspect-ratio` come from CSS, so a badge
 * dropped mid-screen or off the LCD entirely keeps its three tiles, and Playwright calls
 * anything with a box visible even when `.gb-shell`'s `overflow: hidden` has clipped it.
 */
function expectCornerBadge(face: Box, screen: Box): void {
  expect(encloses(screen, face), "on the LCD").toBe(true);
  // The canvas is MAP_W by MAP_H tiles at 10/9, so a tenth of its width is one tile
  // on both axes.
  const tile = screen.width / MAP_W;
  expect(face.x - screen.x, "against the left edge").toBeLessThan(tile);
  expect(face.y - screen.y, "against the top edge").toBeLessThan(tile);
  expect(
    Math.abs(face.width - screen.width * AVATAR_SHARE),
    "three tiles of the LCD",
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(face.height - face.width), "square").toBeLessThanOrEqual(1);
}

/**
 * The theme badge gives up width to the avatar, so it wraps rather than ellipsising.
 * Its box therefore GROWS DOWNWARD, which is the risk this pins: a taller badge must
 * stay on the LCD and off the menu. Its own overflow says almost nothing once it
 * wraps — only an unbreakable word could trip it — so the boxes are the assertion.
 */
async function expectWholeTheme(page: Page): Promise<void> {
  const theme = page.getByTestId("game-theme");
  await expect(theme).toHaveText(WORST_THEME.theme.toUpperCase());
  const clipped = await theme.evaluate(
    (node) => node.scrollWidth > node.clientWidth + 1,
  );
  expect(clipped, "the day's theme reads whole").toBe(false);

  const box = await boxOf(theme);
  expect(encloses(await boxOf(lcd(page)), box), "the theme is on screen").toBe(
    true,
  );
  expect(
    overlaps(box, await boxOf(page.locator(".gb-textbox"))),
    "the theme is clear of the menu",
  ).toBe(false);
  expect(
    overlaps(box, await boxOf(page.getByTestId("game-day"))),
    "the theme is clear of the day",
  ).toBe(false);
}

async function openMenu(page: Page): Promise<void> {
  // Hovering a dialogue choice selects it, so the pointer stays off the shell.
  await page.mouse.move(0, 0);
  await page.keyboard.press("c");
  await expect(page.getByTestId("dialogue-choices")).toBeVisible();
}

async function openArchive(page: Page): Promise<Locator> {
  await walkToShelf(page);
  await page.keyboard.press("Enter");
  const archive = page.getByTestId("archive");
  await expect(archive.getByRole("heading", { name: "Archive" })).toBeVisible();
  await archive.getByRole("button", { name: "Avatars" }).click();
  return archive;
}

test("the archive lists the town's drawn avatars, by sprite key", async ({
  page,
}) => {
  await apiSignIn(page);
  await apiStoreAvatar(page);
  // The narrow shell, because a THIRD tab up in `.arc-bar` is what squeezes the
  // heading beside it, and `.arc-title` is the flex child that gives.
  await page.setViewportSize(NARROW);
  await page.goto("/");
  await pressStart(page);
  const archive = await openArchive(page);

  const title = archive.locator(".arc-title");
  expect(
    await title.evaluate((node) => node.scrollWidth - node.clientWidth),
    "the archive still says Archive",
  ).toBeLessThanOrEqual(0);

  const faces = page.getByTestId("archive-face");
  await expect(faces).toHaveCount(1);
  await expect(page.getByTestId("archive-faces")).toContainText("tester");
  // The rotating handle, never the base64 and never `/api/avatar/image`.
  await expect(faces.getByRole("img")).toHaveAttribute(
    "src",
    /^\/api\/sprites\/[0-9a-f]{16}$/,
  );

  // No day has been revealed, so the feed's own placeholder is one tab away —
  // which is what makes the avatars above having branched before it visible.
  await archive.getByRole("button", { name: "Days" }).click();
  await expect(page.getByTestId("archive-empty")).toBeVisible();
});

test("a sprite drawn with the archive open appears without a reload", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await openArchive(page);

  // Its own placeholder, not `archive-empty`: no day is revealed here either, so
  // the feed's line would satisfy a laxer assertion for entirely the wrong reason.
  await expect(page.getByTestId("archive-faces-empty")).toContainText(
    /nobody has been drawn/i,
  );
  await expect(page.getByTestId("archive-empty")).toHaveCount(0);

  await apiStoreAvatar(page);
  // `refreshSprite` skips the socket that drew, so this passing at all is the
  // `avatar_changed` broadcast doing it.
  await expect(page.getByTestId("archive-face")).toHaveCount(1);
  await expect(page.getByTestId("archive-faces")).toContainText("tester");
});

test("your own avatar is three tiles in the LCD's corner while the menu is open", async ({
  page,
}) => {
  await apiSignIn(page);
  await apiStoreAvatar(page);
  await setDay(page, WORST_THEME.day);
  await page.setViewportSize(PHONE);
  await page.goto("/");

  const face = page.getByTestId("lcd-avatar");
  await expect(face).toHaveCount(0);
  await pressStart(page);
  await expect(face).toHaveCount(0);

  await openMenu(page);
  await expect(face).toBeVisible();

  // The picture `useMyAvatar` fetched, and it DECODED: the box is three tiles from
  // CSS whether or not anything loaded into it, so a broken src would be invisible
  // to every other assertion here.
  await expect(face).toHaveAttribute("src", /^\/api\/avatar\/image\?v=\d+$/);
  await expect
    .poll(() => face.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBeGreaterThan(0);

  const phone = await boxOf(face);
  expectCornerBadge(phone, await boxOf(lcd(page)));

  const theme = page.getByTestId("game-theme");
  const day = page.getByTestId("game-day");
  await expectWholeTheme(page);
  await expect(day).toHaveText(`DAY ${String(WORST_THEME.day)}`);
  for (const other of [theme, day, page.locator(".gb-textbox")]) {
    expect(overlaps(phone, await boxOf(other)), "the corner is its own").toBe(
      false,
    );
  }

  await page.setViewportSize(DESKTOP);
  const wide = await boxOf(face);
  expect(wide.width).toBeGreaterThan(phone.width);
  expectCornerBadge(wide, await boxOf(lcd(page)));
  await expectWholeTheme(page);
  for (const other of [theme, day, page.locator(".gb-textbox")]) {
    expect(overlaps(wide, await boxOf(other)), "the corner is its own").toBe(
      false,
    );
  }

  await page.keyboard.press("Escape");
  await expect(face).toHaveCount(0);
});

test("nothing is in the corner without a sprite, or without a session", async ({
  page,
}) => {
  const face = page.getByTestId("lcd-avatar");

  await page.goto("/");
  await pressStart(page);
  await openMenu(page);
  await expect(page.getByTestId("player-name")).toHaveCount(0);
  await expect(face).toHaveCount(0);

  await apiSignIn(page);
  await page.reload();
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("tester");
  await openMenu(page);
  await expect(page.getByTestId("dialogue-choices")).toContainText("Sign out");
  await expect(face).toHaveCount(0);
});

test("a live event keeps the corner to itself", async ({ page }) => {
  await apiSignIn(page);
  await apiStoreAvatar(page);
  await page.goto("/");
  await pressStart(page);

  await operate(page, "Start event", "Start it");
  await reachPhase(page, "countdown");
  await openMenu(page);
  await expect(page.getByTestId("event-overlay")).toBeVisible();
  await expect(page.getByTestId("lcd-avatar")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await operate(page, "Abort event", "Abort it");
  await expect(page.getByTestId("event-overlay")).toBeHidden();
  await openMenu(page);
  await expect(page.getByTestId("lcd-avatar")).toBeVisible();
});
