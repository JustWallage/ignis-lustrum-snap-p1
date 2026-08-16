import type { Page } from "@playwright/test";
import {
  apiSignIn,
  apiUpload,
  expect,
  operate,
  pressStart,
  reachPodium,
  readDialogue,
  readEvent,
  test,
  walkPodiumToWheel,
  walkToJury,
} from "./fixtures";

const EVENT_TIMEOUT_MS = 180_000;

/** Every way in: the keyboard's A, the shell's own A button, and B, which reaches for
 * the message field. None of the three may put a box over the overlay. */
async function nothingOpens(page: Page): Promise<void> {
  await page.keyboard.press("Enter");
  await page.keyboard.press("x");
  await page.getByTestId("a-button").click();
  await expect(page.getByTestId("dialogue-text")).toBeHidden();
  await expect(page.getByTestId("event-overlay")).toBeVisible();
}

/** The one box that must survive every stage: Abort event lives in it, and so does the
 * host's own question. */
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
  // The lockout this ticket is about: an open box takes SELECT — and with it Abort
  // event — off the person running the evening. Which is also why the event below has
  // to be started through the route: the menu is what the box is holding shut.
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

  // The host's question arrives through that same box, and the transition it causes
  // does not take it away before it has been answered.
  const before = await readEvent(page);
  await page.getByTestId("podium-next").click();
  const choices = await readDialogue(page);
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /move the podium on/i,
  );
  await choices.getByRole("button", { name: "Next place" }).click();
  await expect
    .poll(
      async () => (await readEvent(page)).podiumNextAt !== before.podiumNextAt,
    )
    .toBe(true);

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
