import {
  apiSignIn,
  apiUpload,
  expect,
  openArchive,
  openConsole,
  pressStart,
  setDay,
  test,
  walkToShelf,
} from "./fixtures";
import type { Page } from "@playwright/test";

const GALLERY = "/gallery";

/** The archive's viewer on the one card there is, which is where the share toggle lives:
 * the surface you are looking at the photograph on while you decide about it. */
async function openTheSnap(page: Page) {
  await walkToShelf(page);
  await openArchive(page);
  await page.getByTestId("archive-card").first().getByRole("button").click();
  await expect(page.getByTestId("public-toggle")).toBeVisible();
}

test("a snap reaches the public page only when its photographer puts it there", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await setDay(page, 2);

  // ANONYMOUS, and the whole point: the page answers with no cookie at all, and with
  // nothing on it, because private is the default.
  await page.goto(GALLERY);
  await expect(page.getByTestId("gallery-empty")).toBeVisible();
  await expect(page.getByTestId("gallery-tile")).toHaveCount(0);

  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await openTheSnap(page);
  await expect(page.getByTestId("public-share")).toHaveText("PRIVATE");
  await page.getByTestId("public-share").click();
  await expect(page.getByTestId("public-share")).toHaveText("PUBLIC");

  await page.context().clearCookies();
  await page.goto(GALLERY);
  const tile = page.getByTestId("gallery-tile");
  await expect(tile).toHaveCount(1);
  await expect(page.getByTestId("gallery-day")).toContainText("Day 1");
  await expect(page.getByTestId("gallery-day")).toContainText("tester");

  // The photograph opens, and the page carries none of the town's talk.
  await tile.click();
  await expect(page.getByTestId("gallery-lightbox")).toBeVisible();
  await page.getByTestId("gallery-close").click();
  await expect(page.getByTestId("gallery-lightbox")).toBeHidden();
});

test("the operator's veto takes it back off, and lifting the veto puts it back", async ({
  page,
}) => {
  const id = await apiUpload(page, "voter");
  await setDay(page, 2);
  const shared = await page.request.put(`/api/photos/${String(id)}/public`, {
    data: { shared: true },
  });
  expect(shared.ok()).toBeTruthy();

  await page.goto(GALLERY);
  await expect(page.getByTestId("gallery-tile")).toHaveCount(1);

  // `tester` is the e2e admin, and is NOT this snap's photographer — so the veto is the
  // half of the pair only they have.
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await openTheSnap(page);
  await expect(page.getByTestId("public-veto")).toHaveText("VETO");
  await page.getByTestId("public-veto").click();
  await expect(page.getByTestId("public-veto")).toHaveText("VETOED");

  await page.context().clearCookies();
  await page.goto(GALLERY);
  await expect(page.getByTestId("gallery-empty")).toBeVisible();

  // The photographer's own share survived the veto rather than being rewritten by it.
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await openTheSnap(page);
  await expect(page.getByTestId("public-share")).toHaveText("PUBLIC");
  await page.getByTestId("public-veto").click();
  await expect(page.getByTestId("public-veto")).toHaveText("VETO");

  await page.context().clearCookies();
  await page.goto(GALLERY);
  await expect(page.getByTestId("gallery-tile")).toHaveCount(1);
});

test("shows no switch to a friend who neither took the snap nor runs the town", async ({
  page,
}) => {
  await apiUpload(page, "voter");
  await setDay(page, 2);

  await apiSignIn(page, "rival");
  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await openArchive(page);
  await page.getByTestId("archive-card").first().getByRole("button").click();

  await expect(page.getByTestId("viewer-photo")).toBeVisible();
  await expect(page.getByTestId("public-toggle")).toHaveCount(0);
});

test("the console's spinner says which press is running", async ({ page }) => {
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  const panel = await openConsole(page, "Snaps");

  // Held open, because a fast local worker answers before a spinner can be read — which
  // is exactly the wait this button exists to show.
  await page.route("**/api/admin/photos/*/describe", async (route) => {
    await new Promise((done) => setTimeout(done, 1500));
    await route.continue();
  });

  const describe = panel.getByTestId(/ops-describe-/);
  await describe.first().click();
  await expect(describe.first()).toContainText("Reading it");
  await expect(panel.getByTestId("ops-pending")).toBeVisible();
  await expect(panel.getByTestId("ops-rank-day")).toBeDisabled();
  await expect(panel.getByTestId("ops-pending")).toHaveCount(0, {
    timeout: 20_000,
  });
});

test("the console warns about the day's unjudged snaps", async ({ page }) => {
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  const panel = await openConsole(page, "Snaps");

  // No Gemini key anywhere in e2e, and the ranking no longer runs on upload, so this
  // day has no verdict at all — which is precisely what the banner is for.
  await expect(panel.getByTestId("ops-unjudged")).toContainText(
    /1 of the day's 1 snap has no verdict/i,
  );
});
