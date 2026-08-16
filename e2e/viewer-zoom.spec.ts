import type { Page } from "@playwright/test";
import {
  apiSignIn,
  apiUpload,
  boxOf,
  expect,
  openArchive,
  openBallot,
  openSnapViewer,
  pressStart,
  setDay,
  test,
  walkToShelf,
  walkToVotingNpc,
} from "./fixtures";

const PHONE = { width: 390, height: 844 };

/** Both projects are Desktop Chrome, which has no touch pipeline, so this can only ever
 * read 1 — a guard against the app zooming the BROWSER instead of the picture, not
 * evidence that `maximum-scale=1` holds on a real Android. */
async function browserScale(page: Page): Promise<number> {
  return page.evaluate(() => window.visualViewport?.scale ?? 0);
}

async function photoWidth(page: Page): Promise<number> {
  return (await boxOf(page, "viewer-photo")).width;
}

/** Desktop Chrome has no touch pipeline, so a two-finger pinch is dispatched as the
 * pointer events the viewer listens for. The double-tap below is not synthesised: it is
 * two real clicks, which is what the paging zones under the picture also receive. */
async function pinchOpen(page: Page, spread: number): Promise<void> {
  await page.getByTestId("viewer-frame").evaluate((frame, apart) => {
    const box = frame.getBoundingClientRect();
    const midX = box.left + box.width / 2;
    const midY = box.top + box.height / 2;
    const send = (type: string, id: number, x: number) => {
      frame.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: "touch",
          clientX: x,
          clientY: midY,
          bubbles: true,
        }),
      );
    };
    send("pointerdown", 11, midX - 20);
    send("pointerdown", 12, midX + 20);
    send("pointermove", 11, midX - 20 * apart);
    send("pointermove", 12, midX + 20 * apart);
    send("pointerup", 11, midX - 20 * apart);
    send("pointerup", 12, midX + 20 * apart);
  }, spread);
}

function viewerTitle(page: Page, at: number, of: number) {
  return page
    .locator(".gb-window")
    .getByRole("heading", { name: `Snap ${at} of ${of}` });
}

test("the archive's photograph double-taps open and back to fit, and nothing else moves", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await setDay(page, 2);
  await apiSignIn(page, "tester");

  await page.setViewportSize(PHONE);
  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await openArchive(page);

  await page.getByTestId("archive-photo").first().click();
  await expect(viewerTitle(page, 1, 2)).toBeVisible();
  const fit = await photoWidth(page);
  expect(await browserScale(page)).toBe(1);

  await page.getByTestId("viewer-tap-on").dblclick();
  await expect.poll(async () => photoWidth(page)).toBeGreaterThan(fit * 1.9);
  expect(await browserScale(page)).toBe(1);
  await expect(viewerTitle(page, 1, 2)).toBeVisible();

  await page.getByTestId("viewer-tap-on").dblclick();
  await expect.poll(async () => photoWidth(page)).toBe(fit);

  await page.getByTestId("viewer-tap-on").click();
  await expect(viewerTitle(page, 2, 2)).toBeVisible();
  expect(await photoWidth(page)).toBe(fit);
});

test("the ballot's photograph pinches open, drags without paging, and comes back", async ({
  page,
}) => {
  await apiUpload(page, "rival");
  await apiUpload(page, "voter");
  await apiSignIn(page, "tester");

  await page.setViewportSize(PHONE);
  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);
  await openBallot(page);
  await openSnapViewer(page, 1);

  const fit = await photoWidth(page);
  await pinchOpen(page, 3);
  await expect.poll(async () => photoWidth(page)).toBeGreaterThan(fit * 2.9);
  expect(await browserScale(page)).toBe(1);
  await expect(viewerTitle(page, 1, 2)).toBeVisible();

  const zone = await boxOf(page, "viewer-tap-on");
  const from = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 60, from.y, { steps: 6 });
  await page.mouse.up();
  await expect(viewerTitle(page, 1, 2)).toBeVisible();

  await page.getByTestId("viewer-tap-back").dblclick();
  await expect.poll(async () => photoWidth(page)).toBe(fit);
  await expect(viewerTitle(page, 1, 2)).toBeVisible();
});
