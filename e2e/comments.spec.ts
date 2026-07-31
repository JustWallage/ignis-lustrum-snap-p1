import type { Page } from "@playwright/test";
import {
  apiSignIn,
  apiUpload,
  expect,
  openBallot,
  openSnapViewer,
  pressStart,
  readDialogue,
  test,
  walkToJury,
  walkToVotingNpc,
} from "./fixtures";

async function openThread(page: Page, nth: number) {
  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);
  await openBallot(page);
  await openSnapViewer(page, nth);
  const thread = page.getByTestId("photo-comments");
  await expect(thread).toBeVisible();
  return thread;
}

test("a friend comments on an anonymous snap from the viewer, then takes it back", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await page.context().clearCookies();
  await apiSignIn(page, "voter");

  const thread = await openThread(page, 1);

  await thread.getByPlaceholder("Add a comment…").fill("the light is great");
  await thread.getByRole("button", { name: "Send" }).click();
  await expect(thread).toContainText("the light is great");
  await expect(thread).toContainText("voter");
  await expect(page.locator(".gb-window")).not.toContainText("tester");

  await thread.getByRole("button", { name: "Delete comment" }).click();
  await expect(thread).not.toContainText("the light is great");
});

test("a comment written at the ballot is the same thread the snap's own viewer shows", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await page.context().clearCookies();
  await apiSignIn(page, "voter");

  const thread = await openThread(page, 1);
  await thread.getByPlaceholder("Add a comment…").fill("second helping");
  await thread.getByRole("button", { name: "Send" }).click();
  await expect(thread).toContainText("second helping");

  await page.context().clearCookies();
  await apiSignIn(page, "tester");
  const mine = page.waitForResponse(
    (res) => res.url().includes("/api/photos/mine") && res.ok(),
  );
  await page.goto("/");
  await pressStart(page);
  await mine;
  await walkToJury(page);
  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);
  await choices.getByRole("button", { name: "See my snap" }).click();

  const viewer = page.locator(".gb-window");
  await expect(
    viewer.getByRole("heading", { name: "Snap", exact: true }),
  ).toBeVisible();
  await expect(viewer.getByTestId("photo-comments")).toContainText(
    "second helping",
  );
  await expect(viewer.getByTestId("photo-comments")).toContainText("voter");
});

test("a comment left at the ballot reaches the friend reading the same snap, live", async ({
  page,
  browser,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await page.context().clearCookies();
  await apiSignIn(page, "voter");

  const baseURL = test.info().project.use.baseURL;
  const other = await browser.newContext(
    baseURL === undefined ? {} : { baseURL },
  );
  try {
    const otherPage = await other.newPage();
    await apiSignIn(otherPage, "judge");

    const reader = await openThread(otherPage, 1);
    const writer = await openThread(page, 1);

    await writer.getByPlaceholder("Add a comment…").fill("that broth, though");
    await writer.getByRole("button", { name: "Send" }).click();

    await expect(reader).toContainText("that broth, though");
    await expect(reader).toContainText("voter");
    await expect(otherPage.locator(".gb-window")).not.toContainText("tester");
  } finally {
    await other.close();
  }
});

test("a signed-out walker gets no thread at all", async ({ page }) => {
  await apiUpload(page, "tester");
  await page.context().clearCookies();

  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".gb-window").getByRole("heading", { name: "Sign in" }),
  ).toBeVisible();
  await expect(page.getByTestId("photo-comments")).toBeHidden();

  const denied = await page.request.get("/api/photos/1/comments");
  expect(denied.status()).toBe(401);
});
