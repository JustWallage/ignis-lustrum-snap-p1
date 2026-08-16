import type { Page } from "@playwright/test";
import { prizeListSchema, type Prize } from "../shared/api";
import { WHEEL_SPIN_MS } from "../shared/events";
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

const RIG_TIMEOUT_MS = 180_000;

/** The LAST segment: index 0 is the face the drum already rests on before any landing,
 * so a rig to the first prize is the one a build that never moved could match. */
async function lastPrize(page: Page): Promise<Prize> {
  const listed = await page.request.get("/api/prizes");
  const { prizes } = prizeListSchema.parse(await listed.json());
  const last = prizes[prizes.length - 1];
  if (last === undefined) throw new Error("the wheel has no prizes");
  return last;
}

test("the operator rigs a day from the console, and clears it again", async ({
  page,
}) => {
  await apiSignIn(page, "tester");
  const prize = await lastPrize(page);

  const panel = await openConsole(page, "Rigged landings");
  await expect(page.getByTestId("ops-rig-empty")).toBeVisible();
  await page.getByTestId("ops-rig-day").fill("3");
  await page
    .getByTestId("ops-rig-prize")
    .selectOption(`ordinary:${String(prize.id)}`);
  await page.getByTestId("ops-rig-set").click();
  await expect(panel.getByTestId("ops-rig")).toContainText(
    `Day 3 — Ordinary: ${prize.label}, rigged by tester`,
  );

  await page.reload();
  await page
    .getByRole("button", { name: "Rigged landings", exact: true })
    .click();
  await expect(page.getByTestId("ops-rig")).toContainText(
    `Day 3 — Ordinary: ${prize.label}`,
  );

  await page.getByTestId("ops-rig-clear-3").click();
  await page.getByTestId("ops-rig-clear-3-yes").click();
  await expect(page.getByTestId("ops-rig-empty")).toBeVisible();
});

test("a rigged day rolls and decelerates as ever, and stops on the prize the operator picked", async ({
  page,
}) => {
  test.setTimeout(RIG_TIMEOUT_MS);
  await apiSignIn(page, "tester");
  const prize = await lastPrize(page);
  const rigged = await page.request.post("/api/admin/rig", {
    data: { day: 1, prizeId: prize.id },
  });
  expect(rigged.ok()).toBeTruthy();

  await apiUpload(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await operate(page, "Start event", "Start it");
  await walkPodiumToWheel(page);

  const wheel = await readEvent(page);
  expect(wheel.segments).toContain(prize.label);
  expect(wheel.prizeIndex).toBeNull();

  await page.getByTestId("wheel-spin").click();
  await expect
    .poll(async () => (await readEvent(page)).prizeIndex)
    .not.toBeNull();
  const spun = await readEvent(page);
  const spunAt = spun.spunAt;
  if (spunAt === null) throw new Error("the wheel was not spun");
  expect(spun.segments[spun.prizeIndex ?? -1]).toBe(prize.label);

  await page.clock.setFixedTime(spunAt + WHEEL_SPIN_MS * 0.6);
  await expect(page.getByTestId("wheel")).toBeVisible();
  await expect(page.getByTestId("wheel-prize")).toBeHidden();

  await page.clock.setFixedTime(spunAt + WHEEL_SPIN_MS + 200);
  await expect(page.getByTestId("wheel-prize")).toHaveText(
    prize.label.toUpperCase(),
  );
});
