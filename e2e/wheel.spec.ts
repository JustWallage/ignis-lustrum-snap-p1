import type { Locator, Page } from "@playwright/test";
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

/** `tester` is the admin, so they host every one of these. Handing the day's only snap in
 * as somebody ELSE is therefore how a wheel whose winner is not its host is reached. */
async function aWheel(
  page: Page,
  uploader: "tester" | "rival" = "tester",
): Promise<void> {
  await apiUpload(page, uploader);
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await walkPodiumToWheel(page);
}

/** Geometric on purpose: which label is under the marker runs 0, 1, 2 … whichever way
 * the barrel turns, so it cannot tell the two directions apart. Positive is ABOVE. */
async function aboveLine(
  faces: Locator,
  at: readonly number[],
  line: number,
): Promise<number | null> {
  let best: number | null = null;
  for (const index of at) {
    const box = await faces.nth(index).boundingBox();
    if (box === null) continue;
    const gap = line - (box.y + box.height / 2);
    if (best === null || Math.abs(gap) < Math.abs(best)) best = gap;
  }
  return best;
}

async function facesReading(faces: Locator, label: string): Promise<number[]> {
  const at: number[] = [];
  for (let index = 0; index < (await faces.count()); index += 1) {
    const text = ((await faces.nth(index).textContent()) ?? "").trim();
    if (text === label) at.push(index);
  }
  return at;
}

test("the barrel foreshortens away from the marker, which frames the first prize", async ({
  page,
}) => {
  test.setTimeout(WHEEL_TIMEOUT_MS);
  await aWheel(page);

  const listed = await page.request.get("/api/prizes");
  const { prizes } = prizeListSchema.parse(await listed.json());
  const labels = prizes.filter((prize) => prize.enabled).map((p) => p.label);
  expect(labels.length).toBeGreaterThan(1);

  const wheel = await page.getByTestId("wheel").boundingBox();
  if (wheel === null) throw new Error("the wheel has no box");
  const marker = await page.locator(".gb-wheel-marker").boundingBox();
  if (marker === null) throw new Error("the marker has no box");
  const line = marker.y + marker.height / 2;

  const faces = page.locator(".gb-wheel-seg");
  const inside: { text: string; y: number; height: number }[] = [];
  for (let at = 0; at < (await faces.count()); at += 1) {
    const one = faces.nth(at);
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

  const centred = inside.reduce((nearest, face) =>
    Math.abs(face.y + face.height / 2 - line) <
    Math.abs(nearest.y + nearest.height / 2 - line)
      ? face
      : nearest,
  );
  expect(centred.text).toBe((labels[0] ?? "").toUpperCase());
  expect(
    inside.filter((face) => face.y + face.height <= line).length,
  ).toBeGreaterThan(0);
  expect(inside.filter((face) => face.y >= line).length).toBeGreaterThan(0);

  const readable = inside.filter((face) => face.height > centred.height * 0.4);
  expect(readable.length).toBeGreaterThan(2);
  expect(new Set(readable.map((face) => face.text)).size).toBeGreaterThan(1);

  const shortest = Math.min(...inside.map((face) => face.height));
  expect(shortest).toBeLessThan(centred.height * 0.6);

  expect(Math.abs(marker.height - centred.height)).toBeLessThan(1.5);
  expect(Math.abs(marker.y - centred.y)).toBeLessThan(1.5);
  expect(marker.height).toBeLessThan(wheel.height / 4);
  expect(marker.width).toBeGreaterThan(wheel.width * 0.9);
  expect(line).toBeGreaterThan(wheel.y + wheel.height * 0.4);
  expect(line).toBeLessThan(wheel.y + wheel.height * 0.6);
});

test("the winning face comes DOWN into the marker, and it lands on the prize the server chose", async ({
  page,
}) => {
  test.setTimeout(WHEEL_TIMEOUT_MS);
  await aWheel(page);

  await page.getByTestId("wheel-spin").click();
  await expect
    .poll(async () => (await readEvent(page)).prizeIndex)
    .not.toBeNull();
  const spun = await readEvent(page);
  const spunAt = spun.spunAt;
  if (spunAt === null) throw new Error("the wheel was not spun");
  const prize = (spun.segments[spun.prizeIndex ?? 0] ?? "").toUpperCase();

  // Every sample below is taken after the SPIN button has gone, because losing it
  // re-centres the flex column and moves the whole wheel DOWN — a shift no travel
  // assertion can tell from the roll.
  await expect(page.getByTestId("wheel-spin")).toBeHidden();
  const marker = await page.locator(".gb-wheel-marker").boundingBox();
  if (marker === null) throw new Error("the marker has no box");
  const line = marker.y + marker.height / 2;

  const faces = page.locator(".gb-wheel-seg");
  const winning = await facesReading(faces, prize);
  expect(winning.length).toBeGreaterThan(0);

  // The spin eases out, so it is still a face short of its prize this late.
  await page.clock.setFixedTime(spunAt + WHEEL_SPIN_MS * 0.6);
  await expect
    .poll(async () => await aboveLine(faces, winning, line))
    .toBeGreaterThan(0);
  const far = await aboveLine(faces, winning, line);
  if (far === null) throw new Error("no face carries the prize");

  await page.clock.setFixedTime(spunAt + WHEEL_SPIN_MS * 0.85);
  await expect
    .poll(async () => await aboveLine(faces, winning, line))
    .toBeLessThan(far / 2);
  const near = await aboveLine(faces, winning, line);
  expect(near).toBeGreaterThan(0);

  await page.clock.setFixedTime(spunAt + WHEEL_SPIN_MS + 200);
  await expect(page.getByTestId("wheel-prize")).toHaveText(prize);
});

test("the host turns it from the menu when the winner never does", async ({
  page,
}) => {
  test.setTimeout(WHEEL_TIMEOUT_MS);
  await aWheel(page, "rival");

  await expect(page.getByTestId("event-overlay")).toContainText(
    "THE WINNER IS SPINNING",
  );
  await expect(page.getByTestId("wheel-spin")).toBeHidden();

  await operate(page, "Spin the wheel", "Spin it");
  await expect
    .poll(async () => (await readEvent(page)).prizeIndex)
    .not.toBeNull();

  const spun = await readEvent(page);
  await expect(page.getByTestId("wheel-prize")).toHaveText(
    (spun.segments[spun.prizeIndex ?? 0] ?? "").toUpperCase(),
    { timeout: WHEEL_SPIN_MS * 4 },
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
