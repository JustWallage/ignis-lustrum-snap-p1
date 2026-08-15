import type { Browser, Page } from "@playwright/test";
import { prizeListSchema, prizesPath } from "../shared/api";
import { BEAST_MS, WHEEL_SPIN_MS } from "../shared/events";
import {
  apiSignIn,
  apiUpload,
  expect,
  openConsole,
  operate,
  pressStart,
  readEvent,
  test,
  walkPodiumToWheel,
} from "./fixtures";

const BOWSER_TIMEOUT_MS = 180_000;

const BOWSER_PRIZES = ["Bowsers bed", "Bowsers bier"];

/** Hardcoded because the palette lives under `src/`, which e2e cannot see. The odd
 * faces take `--gb-drum-face` and the even ones its alternate. */
const DRUM = {
  ordinary: "rgb(42, 87, 68)",
  bowser: "rgb(124, 28, 36)",
} as const;

async function markDay(page: Page, day: number): Promise<void> {
  const res = await page.request.post("/api/admin/bowser", { data: { day } });
  expect(res.ok()).toBeTruthy();
}

async function fillBowserWheel(page: Page): Promise<void> {
  for (const label of BOWSER_PRIZES) {
    const res = await page.request.post(prizesPath("bowser"), {
      data: { label },
    });
    expect(res.status()).toBe(201);
  }
}

/** `tester` is the admin, so they host — and, handing today's only snap in themselves,
 * win it too. */
async function aWheelOn(page: Page, day: "marked" | "ordinary"): Promise<void> {
  await apiSignIn(page, "tester");
  if (day === "marked") {
    await markDay(page, 1);
    await fillBowserWheel(page);
  }
  await apiUpload(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await walkPodiumToWheel(page);
}

async function faceColour(page: Page): Promise<string> {
  return page
    .locator(".gb-wheel-seg")
    .first()
    .evaluate((face) => getComputedStyle(face).backgroundColor);
}

async function watchingFrom(
  browser: Browser,
  at: number,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await apiSignIn(page, "voter");
  // Pinned BEFORE the first paint: what this screen shows is what it worked out from
  // the beast's absolute moment, never the beginning of something it started itself.
  await page.clock.setFixedTime(at);
  await page.goto("/");
  return {
    page,
    close: () => context.close(),
  };
}

test("the operator marks a day and fills the Bowser wheel, and neither touches the other", async ({
  page,
}) => {
  await apiSignIn(page, "tester");
  const panel = await openConsole(page, "Bowser days");
  await expect(page.getByTestId("ops-bowser-empty")).toBeVisible();
  await page.getByTestId("ops-bowser-day").fill("3");
  await page.getByTestId("ops-bowser-mark").click();
  await expect(panel.getByTestId("ops-bowser")).toContainText(
    "Day 3 — marked by tester",
  );

  await panel.getByRole("button", { name: "Prizes", exact: true }).click();
  await page.getByTestId("ops-prize-set-bowser").click();
  for (const label of BOWSER_PRIZES) {
    await panel.getByPlaceholder("New prize…").fill(label);
    await panel.getByRole("button", { name: "Add", exact: true }).click();
    await expect(panel.getByLabel(`Prize ${label}`)).toBeVisible();
  }

  // The ordinary list is the one every other caller reads, and adding to the Bowser
  // one may not have moved it.
  await page.getByTestId("ops-prize-set-ordinary").click();
  const listed = await page.request.get("/api/prizes");
  const ordinary = prizeListSchema
    .parse(await listed.json())
    .prizes.map((prize) => prize.label);
  expect(ordinary).not.toContain(BOWSER_PRIZES[0]);
  for (const label of ordinary) {
    await expect(panel.getByLabel(`Prize ${label}`)).toBeVisible();
  }
  await expect(
    panel.getByLabel(`Prize ${BOWSER_PRIZES[0] ?? ""}`),
  ).toBeHidden();

  await page.reload();
  await page.getByRole("button", { name: "Bowser days", exact: true }).click();
  await expect(page.getByTestId("ops-bowser")).toContainText(
    "Day 3 — marked by tester",
  );

  await page.getByRole("button", { name: "Prizes", exact: true }).click();
  await page.getByTestId("ops-prize-set-bowser").click();
  for (const label of BOWSER_PRIZES) {
    await expect(page.getByLabel(`Prize ${label}`)).toBeVisible();
  }

  // Unmarking puts the day back to an ordinary one.
  await page.getByRole("button", { name: "Bowser days", exact: true }).click();
  await page.getByTestId("ops-bowser-unmark-3").click();
  await page.getByTestId("ops-bowser-unmark-3-yes").click();
  await expect(page.getByTestId("ops-bowser-empty")).toBeVisible();
});

test("a marked day ends in the beast and a red wheel carrying the Bowser prizes", async ({
  page,
  browser,
}) => {
  test.setTimeout(BOWSER_TIMEOUT_MS);
  await aWheelOn(page, "marked");

  const wheel = await readEvent(page);
  expect(wheel.bowser).toBe(true);
  expect(wheel.segments).toEqual(BOWSER_PRIZES);
  const beastEndsAt = wheel.beastEndsAt;
  if (beastEndsAt === null) throw new Error("the wheel came up with no beast");

  await page.clock.setFixedTime(beastEndsAt - BEAST_MS + 200);
  const beast = page.getByTestId("beast");
  await expect(beast).toBeVisible();
  await expect(beast.getByTestId("beast-figure")).toBeVisible();
  await expect(beast.getByTestId("crowd-character")).toBeVisible();
  await expect(page.getByTestId("wheel")).toBeHidden();

  const inside = await watchingFrom(browser, beastEndsAt - BEAST_MS / 2);
  await expect(inside.page.getByTestId("beast")).toBeVisible();
  const after = await watchingFrom(browser, beastEndsAt + 1_000);
  await expect(after.page.getByTestId("wheel")).toBeVisible();
  await expect(after.page.getByTestId("beast")).toBeHidden();
  await inside.close();
  await after.close();

  await expect(page.getByTestId("wheel-spin")).toBeHidden();
  await page.getByTestId("select-button").click();
  const choices = page.getByTestId("dialogue-choices");
  await expect(choices).toBeVisible();
  await expect(
    choices.getByRole("button", { name: "Spin the wheel" }),
  ).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(choices).toBeHidden();

  // `setSystemTime`, not `setFixedTime`: everything after this is the event running
  // itself again.
  await page.clock.setSystemTime(Date.now());
  await expect(page.getByTestId("beast")).toBeHidden();
  await expect(page.getByTestId("wheel")).toBeVisible();
  expect(await faceColour(page)).toBe(DRUM.bowser);
  // Read off the wheel the DO published, not off the labels typed above.
  for (const label of wheel.segments) {
    await expect(page.getByTestId("wheel")).toContainText(label.toUpperCase());
  }

  await page.getByTestId("wheel-spin").click();
  await expect
    .poll(async () => (await readEvent(page)).prizeIndex)
    .not.toBeNull();
  const spun = await readEvent(page);
  const spunAt = spun.spunAt;
  if (spunAt === null) throw new Error("the wheel was not spun");
  expect(spun.bowser).toBe(true);
  expect(spun.beastEndsAt).toBe(beastEndsAt);

  await page.clock.setFixedTime(spunAt + WHEEL_SPIN_MS * 0.6);
  await expect(page.getByTestId("beast")).toBeHidden();
  expect(await faceColour(page)).toBe(DRUM.bowser);

  await page.clock.setFixedTime(spunAt + WHEEL_SPIN_MS + 200);
  await expect(page.getByTestId("wheel-prize")).toHaveText(
    (spun.segments[spun.prizeIndex ?? 0] ?? "").toUpperCase(),
  );
  expect(BOWSER_PRIZES.map((label) => label.toUpperCase())).toContain(
    await page.getByTestId("wheel-prize").textContent(),
  );

  await page.clock.setSystemTime(Date.now());
  await expect(page.getByTestId("event-overlay")).toBeHidden({
    timeout: 60_000,
  });
  await expect(page.getByTestId("game-day")).toHaveText("DAY 2");
});

test("an ordinary day gets no beast, and the wheel it has always had", async ({
  page,
}) => {
  test.setTimeout(BOWSER_TIMEOUT_MS);
  await apiSignIn(page, "tester");
  // Marked, then unmarked: a day that was never marked would pass this against a build
  // that reads the table wrong in the same direction every time.
  await markDay(page, 1);
  const unmarked = await page.request.delete("/api/admin/bowser/1");
  expect(unmarked.ok()).toBeTruthy();
  await fillBowserWheel(page);

  await aWheelOn(page, "ordinary");

  const wheel = await readEvent(page);
  expect(wheel.bowser).toBe(false);
  expect(wheel.beastEndsAt).toBeNull();
  for (const label of BOWSER_PRIZES) {
    expect(wheel.segments).not.toContain(label);
  }

  await expect(page.getByTestId("beast")).toBeHidden();
  await expect(page.getByTestId("wheel")).toBeVisible();
  expect(await faceColour(page)).toBe(DRUM.ordinary);
  await expect(page.getByTestId("wheel-spin")).toBeVisible();
});
