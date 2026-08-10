import type { Locator, Page } from "@playwright/test";
import {
  apiSignIn,
  apiStoreAvatar,
  AVATAR_PNG,
  expect,
  joinAs,
  pressStart,
  readDialogue,
  test,
  walkToArtist,
  walkToShelf,
} from "./fixtures";

const REDRAWN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJUlEQVR42mNgIAX8JwEwUKRhVMOohlENoxpGNYxqGNUwqmFwaAAAtRhfP2Ll8H4AAAAASUVORK5CYII=",
  "base64",
);

async function openAvatars(page: Page): Promise<Locator> {
  await walkToShelf(page);
  await page.keyboard.press("Enter");
  const archive = page.getByTestId("archive");
  await expect(archive.getByRole("heading", { name: "Archive" })).toBeVisible();
  await archive.getByRole("button", { name: "Avatars" }).click();
  return archive;
}

/** Newest-first inside each player, so `nth(1)` is the older drawing. */
async function keyOfFace(faces: Locator, nth: number): Promise<string> {
  const src = await faces.nth(nth).getByRole("img").getAttribute("src");
  expect(src).toMatch(/^\/api\/sprites\/[0-9a-f]{16}$/);
  return src ?? "";
}

function faceWith(page: Page, src: string): Locator {
  return page
    .getByTestId("archive-face")
    .filter({ has: page.locator(`img[src="${src}"]`) });
}

test("the gallery keeps every drawing, not one face per player", async ({
  page,
}) => {
  await apiSignIn(page, "rival");
  await apiStoreAvatar(page, AVATAR_PNG);
  await apiSignIn(page, "tester");
  await apiStoreAvatar(page, AVATAR_PNG);
  await apiStoreAvatar(page, REDRAWN_PNG);

  await page.goto("/");
  await pressStart(page);
  await openAvatars(page);

  await expect(page.getByTestId("archive-face")).toHaveCount(3);
  await expect(page.getByTestId("archive-shelf")).toHaveCount(2);
  await expect(page.getByTestId("archive-face-worn")).toHaveCount(2);
});

test("wearing an old sprite from the archive reaches a second screen", async ({
  page,
  browser,
}) => {
  await apiSignIn(page);
  await apiStoreAvatar(page, AVATAR_PNG);
  await apiStoreAvatar(page, REDRAWN_PNG);

  const watcher = await joinAs(browser, "rival");
  await openAvatars(watcher);
  const older = await keyOfFace(watcher.getByTestId("archive-face"), 1);
  await expect(
    faceWith(watcher, older).getByTestId("archive-face-worn"),
  ).toHaveCount(0);

  await page.goto("/");
  await pressStart(page);
  await openAvatars(page);
  await faceWith(page, older).getByRole("button").click();
  const sheet = page.getByTestId("avatar-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("avatar-wear").click();

  // The watcher never reloads: `avatar_changed` is what moves the badge, and the
  // count pins that the OLD face gained it rather than a second one appearing.
  await expect(
    faceWith(watcher, older).getByTestId("archive-face-worn"),
  ).toHaveCount(1);
  await expect(watcher.getByTestId("archive-face-worn")).toHaveCount(1);
  await expect(watcher.getByTestId("archive-face")).toHaveCount(2);

  await watcher.context().close();
});

test("the artist offers the same wardrobe, and wearing spends no ink", async ({
  page,
}) => {
  // A rival with a face of their own, or the shelf count below would read as `mineOnly`
  // working when there was never anybody else's face to leave out.
  await apiSignIn(page, "rival");
  await apiStoreAvatar(page, AVATAR_PNG);
  await apiSignIn(page);
  await apiStoreAvatar(page, AVATAR_PNG);
  await apiStoreAvatar(page, REDRAWN_PNG);

  await page.goto("/");
  await pressStart(page);
  await walkToArtist(page);
  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);

  let drew = false;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/avatar"
    ) {
      drew = true;
    }
  });

  await choices.getByRole("button", { name: "Wear an old one" }).click();
  const wardrobe = page.locator(".gb-window");
  await expect(
    wardrobe.getByRole("heading", { name: "Your avatars" }),
  ).toBeVisible();
  await expect(page.getByTestId("archive-shelf")).toHaveCount(1);
  await expect(page.getByTestId("archive-face")).toHaveCount(2);
  await expect(page.getByTestId("archive-faces")).not.toContainText("rival");

  const older = await keyOfFace(page.getByTestId("archive-face"), 1);
  await faceWith(page, older).getByRole("button").click();
  await page.getByTestId("avatar-wear").click();

  await expect(
    faceWith(page, older).getByTestId("archive-face-worn"),
  ).toHaveCount(1);
  expect(drew).toBe(false);
});

test("a comment on an avatar is on screen for a second browser", async ({
  page,
  browser,
}) => {
  await apiSignIn(page);
  await apiStoreAvatar(page, AVATAR_PNG);

  await page.goto("/");
  await pressStart(page);
  await openAvatars(page);
  const worn = await keyOfFace(page.getByTestId("archive-face"), 0);
  await faceWith(page, worn).getByRole("button").click();
  await expect(page.getByTestId("avatar-sheet")).toBeVisible();

  const watcher = await joinAs(browser, "rival");
  await openAvatars(watcher);
  await faceWith(watcher, worn).getByRole("button").click();
  const theirs = watcher.getByTestId("comment-thread");
  await expect(theirs).toBeVisible();

  await page
    .getByTestId("comment-thread")
    .getByRole("textbox")
    .fill("good hat");
  await page.getByRole("button", { name: "Send" }).click();

  // No reload on either side: `comment_created` carries the sprite as its subject and
  // the thread refetches on it.
  await expect(theirs).toContainText("good hat");
  await expect(theirs).toContainText("tester");

  await watcher.context().close();
});
