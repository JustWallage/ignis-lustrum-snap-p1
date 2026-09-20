import {
  apiSignIn,
  apiUpload,
  expect,
  openConsole,
  pressStart,
  readDialogue,
  test,
} from "./fixtures";

/** No Playwright environment has a Gemini key, so every snap here takes the day-level
 * fallback — a verdict row with `ai_status = 'failed'`. That is exactly the case the
 * warning has to catch: a row the console prints as a fallback is a snap the jury did
 * NOT stand behind, and counting rows alone would call this day fully ranked. */
test("warns the host about the jury's gap before the event starts", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);

  await page.getByTestId("select-button").click();
  await page
    .getByTestId("dialogue-choices")
    .getByRole("button", { name: "Start event" })
    .click();

  const text = page.getByTestId("dialogue-text");
  await expect(text).toContainText(/1 of today's 1 snap has no verdict/i);

  // The warning is a page in FRONT of the question, not a replacement for it: the host
  // still gets Cancel first and the press that starts the evening.
  const choices = await readDialogue(page);
  await expect(text).toContainText(/start tonight's live event/i);
  await expect(choices.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(choices.getByRole("button", { name: "Start it" })).toBeVisible();
});

test("says nothing on a day the jury stands behind", async ({ page }) => {
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);

  // A day nobody handed anything in to has no gap to warn about, which is the other
  // side of the count: a warning on an empty day is a warning nobody can act on.
  await page.getByTestId("select-button").click();
  await page
    .getByTestId("dialogue-choices")
    .getByRole("button", { name: "Start event" })
    .click();
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /start tonight's live event/i,
  );
  await expect(page.getByTestId("dialogue-text")).not.toContainText(/JURY:/);
});

test("the console counts the same gap the host is warned about", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  const panel = await openConsole(page, "Snaps");
  await expect(panel).toContainText(/Evaluated 0 of 1/);
});
