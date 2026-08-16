import type { Page } from "@playwright/test";
import {
  apiSignIn,
  apiUpload,
  expect,
  operate,
  pressStart,
  reachPodium,
  test,
  walkPodiumToWheel,
  walkToJury,
} from "./fixtures";

const EVENT_TIMEOUT_MS = 180_000;

async function nothingOpens(page: Page): Promise<void> {
  await page.keyboard.press("Enter");
  await page.keyboard.press("x");
  await page.getByTestId("a-button").click();
  await expect(page.getByTestId("dialogue-text")).toBeHidden();
  await expect(page.getByTestId("event-overlay")).toBeVisible();
}

async function selectStillOpens(page: Page): Promise<void> {
  await page.getByTestId("select-button").click();
  await expect(
    page.getByTestId("dialogue-choices").getByRole("button", {
      name: "Abort event",
    }),
  ).toBeVisible();
  await page.keyboard.press("x");
  await expect(page.getByTestId("dialogue-choices")).toBeHidden();
}

test("an event closes the conversation it lands on, and hands the host back SELECT at every stage", async ({
  page,
}) => {
  test.setTimeout(EVENT_TIMEOUT_MS);
  // Three snaps, so the reveal has a 3rd place to stop on and the podium is walked
  // rather than skipped.
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await apiUpload(page, "voter");
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  await walkToJury(page);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toBeVisible();
  // Started through the route, not the menu: the box this spec just opened is what is
  // holding SELECT — and with it every host item — shut.
  await expect(page.getByTestId("select-button")).toBeDisabled();
  expect((await page.request.post("/api/admin/event/start")).ok()).toBeTruthy();

  await expect(page.getByTestId("event-overlay")).toHaveAttribute(
    "data-phase",
    "countdown",
  );
  await expect(page.getByTestId("dialogue-text")).toBeHidden();
  await nothingOpens(page);
  await selectStillOpens(page);

  await reachPodium(page, "3RD");
  await nothingOpens(page);
  await selectStillOpens(page);

  // Every boundary `walkPodiumToWheel` crosses goes through `hostNext`, which reads the
  // host's confirmation out of that same box — so walking the podium IS the assertion
  // that an event closing conversations has not closed the one it raises itself.
  await walkPodiumToWheel(page);
  await nothingOpens(page);
  await selectStillOpens(page);

  // From the menu rather than the winner's button: who won three tied snaps is not
  // this spec's business, and the host may always turn it.
  await operate(page, "Spin the wheel", "Spin it");
  await expect(page.getByTestId("wheel-prize")).toBeVisible({
    timeout: 30_000,
  });
  await nothingOpens(page);
  await selectStillOpens(page);
});
