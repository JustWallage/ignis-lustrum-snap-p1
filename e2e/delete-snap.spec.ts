import type { Page } from "@playwright/test";
import {
  apiSignIn,
  apiUpload,
  expect,
  filterBy,
  openArchive,
  pressStart,
  readDialogue,
  setDay,
  test,
  TODAY,
  walkToJury,
  walkToShelf,
} from "./fixtures";

/** The question the shell asks for both viewers. It lives in the LCD's dialogue box —
 * the app's ONE "are you sure?" — which is why the viewer has to come off the screen to
 * ask it. */
const DELETE_ASK = /tear this snap up/i;

async function askToDelete(page: Page) {
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const choices = await readDialogue(page);
  await expect(page.getByTestId("dialogue-text")).toContainText(DELETE_ASK);
  // Cancel is always the FIRST choice, so A-ing through a question destroys nothing. Not
  // `toHaveText`: the selected choice carries the cursor glyph as well as its label.
  await expect(choices.getByRole("button").first()).toContainText("Cancel");
  return choices;
}

async function stillThere(page: Page, id: number): Promise<void> {
  const res = await page.request.get(`/api/photos/${String(id)}`);
  expect(res.status()).toBe(200);
}

async function goneFor(page: Page, id: number): Promise<void> {
  await expect
    .poll(async () =>
      (await page.request.get(`/api/photos/${String(id)}`)).status(),
    )
    .toBe(404);
}

test("the jury's viewer asks before tearing a snap up, and Cancel keeps it", async ({
  page,
}) => {
  const mine = await apiUpload(page, "tester");
  await apiSignIn(page, "tester");

  await page.goto("/");
  await pressStart(page);
  await walkToJury(page);
  await page.keyboard.press("Enter");
  const talk = await readDialogue(page);
  await talk.getByRole("button", { name: "See my snap" }).click();
  const dialog = page.locator(".gb-window");
  const snap = dialog.getByRole("heading", { name: "Snap", exact: true });
  await expect(snap).toBeVisible();

  const cancelled = await askToDelete(page);
  await cancelled.getByRole("button", { name: "Cancel" }).click();
  // Back on the very snap: a cancel that dropped the reader onto the map would look
  // like a cancel from anywhere else, and the snap surviving is the point.
  await expect(snap).toBeVisible();
  await stillThere(page, mine);

  const confirmed = await askToDelete(page);
  await confirmed.getByRole("button", { name: "Delete it" }).click();
  await goneFor(page, mine);

  // The jury is taking submissions again, so the shell heard about it too.
  await expect(
    page.getByText(new RegExp(`talk to ${TODAY.name}`, "i")),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  const after = await readDialogue(page);
  await expect(
    after.getByRole("button", { name: "Upload photo" }),
  ).toBeVisible();
});

test("the archive's viewer asks the same question, and Cancel puts the archive back", async ({
  page,
}) => {
  const mine = await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await setDay(page, 2);
  await apiSignIn(page, "tester");

  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await openArchive(page);
  await expect(page.getByTestId("archive-card")).toHaveCount(2);

  await filterBy(page, "archive-people", "tester");
  await page.getByTestId("archive-photo").click();
  await expect(
    page.locator(".gb-window").getByRole("heading", { name: "Snap 1 of 1" }),
  ).toBeVisible();

  const cancelled = await askToDelete(page);
  await cancelled.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("archive-results")).toBeVisible();
  await expect(page.getByTestId("archive-card")).toHaveCount(2);
  await stillThere(page, mine);

  await filterBy(page, "archive-people", "tester");
  await page.getByTestId("archive-photo").click();
  const confirmed = await askToDelete(page);
  await confirmed.getByRole("button", { name: "Delete it" }).click();

  await expect(page.getByTestId("archive-results")).toBeVisible();
  await expect(page.getByTestId("archive-card")).toHaveCount(1);
  await goneFor(page, mine);
});

test("somebody else's snap in the archive has nothing to delete it with", async ({
  page,
}) => {
  await apiUpload(page, "rival");
  await setDay(page, 2);
  // Not `tester`: that is the e2e deployment's admin, and an admin may delete anybody's.
  await page.context().clearCookies();
  await apiSignIn(page, "voter");

  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await openArchive(page);
  await page.getByTestId("archive-photo").click();
  const viewer = page.locator(".gb-window");
  await expect(
    viewer.getByRole("heading", { name: "Snap 1 of 1" }),
  ).toBeVisible();
  await expect(
    viewer.getByRole("button", { name: "Delete", exact: true }),
  ).toHaveCount(0);
});
