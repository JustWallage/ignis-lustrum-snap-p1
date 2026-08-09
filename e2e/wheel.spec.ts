import type { Page } from "@playwright/test";
import { prizeListSchema } from "../shared/api";
import { WHEEL_SPIN_MS } from "../shared/events";
import {
  apiSignIn,
  apiUpload,
  expect,
  operate,
  pressStart,
  readEvent,
  test,
  walkPodiumToWheel,
} from "./fixtures";

const WHEEL_TIMEOUT_MS = 180_000;

async function aWheel(page: Page): Promise<void> {
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await walkPodiumToWheel(page);
}

test("several prizes are readable at rest, above and below the marker", async ({
  page,
}) => {
  test.setTimeout(WHEEL_TIMEOUT_MS);
  await aWheel(page);

  const listed = await page.request.get("/api/prizes");
  const { prizes } = prizeListSchema.parse(await listed.json());
  const labels = prizes.filter((prize) => prize.enabled).map((p) => p.label);
  expect(labels.length).toBeGreaterThan(1);

  // Playwright calls anything with a box "visible", including a segment clipped
  // out of sight by the wheel's `overflow: hidden` — so the claim is checked
  // against the wheel's OWN box rather than against the viewport.
  const wheel = await page.getByTestId("wheel").boundingBox();
  if (wheel === null) throw new Error("the wheel has no box");
  const marker = await page.locator(".gb-wheel-marker").boundingBox();
  if (marker === null) throw new Error("the marker has no box");
  const line = marker.y + marker.height / 2;

  const segments = page.locator(".gb-wheel-seg");
  const inside: { text: string; y: number; height: number }[] = [];
  for (let at = 0; at < (await segments.count()); at += 1) {
    const one = segments.nth(at);
    const box = await one.boundingBox();
    if (box === null) continue;
    if (box.y < wheel.y - 1) continue;
    if (box.y + box.height > wheel.y + wheel.height + 1) continue;
    inside.push({
      text: ((await one.textContent()) ?? "").trim(),
      y: box.y,
      height: box.height,
    });
  }
  expect(inside.length).toBeGreaterThan(3);
  expect(inside.filter((seg) => seg.y + 1 < line).length).toBeGreaterThan(0);
  expect(inside.filter((seg) => seg.y > line).length).toBeGreaterThan(0);
  const under = inside.find(
    (seg) => seg.y <= line && line < seg.y + seg.height,
  );
  expect(under?.text).toBe((labels[0] ?? "").toUpperCase());

  expect(marker.width).toBeGreaterThan(wheel.width * 0.9);
  expect(marker.height).toBeLessThan(wheel.height / 4);
  expect(line).toBeGreaterThan(wheel.y + wheel.height * 0.4);
  expect(line).toBeLessThan(wheel.y + wheel.height * 0.6);
});

test("it scrolls downward and lands on the prize the server chose", async ({
  page,
}) => {
  test.setTimeout(WHEEL_TIMEOUT_MS);
  await aWheel(page);

  const ribbon = page.locator(".gb-wheel-ribbon");
  const before = await ribbon.boundingBox();
  if (before === null) throw new Error("the ribbon has no box");

  await page.getByTestId("wheel-spin").click();
  await expect
    .poll(async () => (await readEvent(page)).prizeIndex)
    .not.toBeNull();
  const spun = await readEvent(page);
  const spunAt = spun.spunAt;
  if (spunAt === null) throw new Error("the wheel was not spun");

  await page.clock.setFixedTime(spunAt + WHEEL_SPIN_MS / 2);
  // The bare sample this replaces is what flaked: a frame that has applied the spin but
  // not yet re-read the pinned clock sits at offset 0 WITHOUT the SPIN button, and
  // losing that button re-centres the column and moves the ribbon DOWN — so it fails the
  // other way rather than tying.
  await expect
    .poll(async () => (await ribbon.boundingBox())?.y ?? before.y)
    .toBeLessThan(before.y);
  const during = await ribbon.boundingBox();
  expect(during?.x ?? -1).toBe(before.x);

  await page.clock.setFixedTime(spunAt + WHEEL_SPIN_MS + 200);
  await expect(page.getByTestId("wheel-prize")).toHaveText(
    (spun.segments[spun.prizeIndex ?? 0] ?? "").toUpperCase(),
  );
});

test("the winner is the only one told to press anything", async ({
  page,
  browser,
}) => {
  test.setTimeout(WHEEL_TIMEOUT_MS);
  const context = await browser.newContext();
  const friend = await context.newPage();
  await apiSignIn(friend, "rival");
  await friend.goto("/");
  await friend.getByTestId("start-button").click();

  await aWheel(page);

  await expect(page.getByTestId("event-overlay")).toContainText(
    "SPIN FOR YOUR PRIZE",
  );
  await expect(friend.getByTestId("event-overlay")).toContainText(
    "THE WINNER IS SPINNING",
  );
  await expect(friend.getByTestId("event-overlay")).not.toContainText(
    "SPIN FOR YOUR PRIZE",
  );
  await expect(friend.getByTestId("wheel-spin")).toBeHidden();

  await context.close();
});
