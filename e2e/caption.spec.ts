import {
  apiSignIn,
  apiUpload,
  expect,
  openBallot,
  openSnapViewer,
  pressStart,
  readDialogue,
  saveCaption,
  test,
  walkToJury,
  walkToVotingNpc,
} from "./fixtures";
import type { Page } from "@playwright/test";

const LINE = "Shot from the roof at four in the morning";

/** The jury's conversation on its submitted branch, which is where the pen lives. */
async function openJuryChoices(page: Page) {
  await walkToJury(page);
  await page.keyboard.press("Enter");
  return readDialogue(page);
}

async function writeCaption(page: Page, text: string): Promise<void> {
  const field = page.getByTestId("say-input");
  await expect(field).toBeVisible();
  await field.fill(text);
  await page.getByTestId("say-send").click();
  await expect(field).toBeHidden();
}

test("the photographer's line reaches a voter and their name does not", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  // A second snap, so the ballot is a real field rather than one candidate.
  await apiUpload(page, "voter");

  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  const choices = await openJuryChoices(page);
  await choices.getByRole("button", { name: "Caption it" }).click();
  await writeCaption(page, LINE);

  // The box closes onto no page at all, so the pen's own label is the receipt — and
  // it flips only once the refreshed submission comes back, which is why this is an
  // assertion on the open box rather than a read after it.
  await page.keyboard.press("Enter");
  const again = await readDialogue(page);
  await expect(
    again.getByRole("button", { name: "Change the caption" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await apiSignIn(page, "voter");
  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);
  await openBallot(page);
  // Ordered by id, so the first candidate is the snap captioned above.
  await openSnapViewer(page, 1);

  await expect(page.getByTestId("viewer-caption")).toHaveText(LINE);
  // The whole point of the feature: the line is under the picture and the
  // photographer is still nobody. A comment saying the same thing would be signed.
  await expect(page.getByText("tester")).toHaveCount(0);
});

test("the snap window captions instead of commenting", async ({ page }) => {
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);

  const choices = await openJuryChoices(page);
  await choices.getByRole("button", { name: "See my snap" }).click();
  await expect(page.getByTestId("caption-field")).toBeVisible();
  // Your own snap, so the thread reads and does not write: a comment here would be the
  // signature the caption exists to spare you.
  await expect(page.getByTestId("comment-thread")).toBeVisible();
  await expect(page.getByPlaceholder("Add a comment…")).toHaveCount(0);

  await saveCaption(page, LINE);
  await expect(page.getByTestId("caption-input")).toHaveValue(LINE);

  // Read back off the route, because the field would hold what was typed either way.
  const mine = await page.request.get("/api/photos/mine");
  expect(mine.ok()).toBeTruthy();
  expect(await mine.json()).toMatchObject({ photo: { caption: LINE } });
});

test("clearing the line takes it off rather than storing a blank", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);

  const choices = await openJuryChoices(page);
  await choices.getByRole("button", { name: "Caption it" }).click();
  await writeCaption(page, LINE);

  await page.keyboard.press("Enter");
  const written = await readDialogue(page);
  await written.getByRole("button", { name: "Change the caption" }).click();
  // The field opens on what is already there, which is what makes this an EDIT.
  await expect(page.getByTestId("say-input")).toHaveValue(LINE);
  await writeCaption(page, "");

  await page.keyboard.press("Enter");
  const cleared = await readDialogue(page);
  await expect(
    cleared.getByRole("button", { name: "Caption it" }),
  ).toBeVisible();
});
