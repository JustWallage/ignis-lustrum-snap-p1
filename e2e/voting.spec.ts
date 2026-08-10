import type { Page } from "@playwright/test";
import { ballotSchema } from "../shared/api";
import {
  apiSignIn,
  apiUpload,
  boxOf,
  expect,
  openBallot,
  openSnapViewer,
  pressStart,
  rankCurrent,
  readDialogue,
  tapViewer,
  test,
  walkToVotingNpc,
  windowBox,
} from "./fixtures";

function filledSlots(page: Page) {
  return page.getByTestId("podium").locator('[data-filled="true"]');
}

/** `.modal-layer.is-full`'s own padding, in px — the one gap a full-screen window is
 * allowed to leave. */
const LAYER_PAD = 8;

/** `max-w-3xl`, the cap the one-photograph viewer keeps. */
const WIDE_MAX = 768;

test("the overview fills the viewport; the viewer and a narrow window keep their own", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await apiUpload(page, "voter");
  await page.context().clearCookies();

  const viewport = page.viewportSize();
  if (viewport === null) throw new Error("this run has no viewport to measure");

  // The narrow default first, while nobody is signed in: the sign-in window comes
  // through the same shell, so it is what a leaking full-screen mode would break.
  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".gb-window").getByRole("heading", { name: "Sign in" }),
  ).toBeVisible();
  const narrow = await windowBox(page);
  expect(narrow.width).toBeLessThan(viewport.width / 2);

  await apiSignIn(page, "judge");
  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);
  await openBallot(page);

  const overview = await windowBox(page);
  expect(overview.x).toBeLessThanOrEqual(LAYER_PAD);
  expect(overview.y).toBeLessThanOrEqual(LAYER_PAD);
  expect(overview.width).toBeGreaterThanOrEqual(viewport.width - 2 * LAYER_PAD);
  expect(overview.height).toBeGreaterThanOrEqual(
    viewport.height - 2 * LAYER_PAD,
  );
  expect(overview.width).toBeLessThanOrEqual(viewport.width);
  expect(overview.height).toBeLessThanOrEqual(viewport.height);

  const viewer = await openSnapViewer(page, 1);
  await expect(
    viewer.getByRole("heading", { name: "Snap 1 of 3" }),
  ).toBeVisible();
  const shown = await windowBox(page);
  expect(shown.width).toBeLessThanOrEqual(WIDE_MAX);
  expect(shown.width).toBeLessThan(overview.width);
  expect(shown.height).toBeLessThan(viewport.height);
});

test("the NPC explains the ballot, then hands over a full screen of snaps", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await apiUpload(page, "voter");
  await page.context().clearCookies();
  await apiSignIn(page, "judge");

  // The viewer judges anonymous snaps, so it must never reach for the one
  // endpoint that would name a photographer. Watched for the whole test.
  const identified: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/photos\/\d+(\?|$)/.test(new URL(request.url()).pathname)) {
      identified.push(request.url());
    }
  });

  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);
  await expect(page.getByText(/rank today's snaps/i)).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toBeVisible();
  const choices = await readDialogue(page);
  await expect(
    choices.getByRole("button", { name: "View photos" }),
  ).toBeVisible();
  await choices.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("dialogue-text")).toBeHidden();

  const dialog = await openBallot(page);
  await expect(
    dialog.getByTestId("vote-candidates").getByRole("button"),
  ).toHaveCount(3);
  for (const name of ["tester", "rival", "voter"]) {
    await expect(dialog).not.toContainText(name);
  }

  const viewer = await openSnapViewer(page, 1);
  await expect(
    viewer.getByRole("heading", { name: "Snap 1 of 3" }),
  ).toBeVisible();
  await expect(viewer.getByTestId("viewer-photo")).toBeVisible();
  await expect(filledSlots(page)).toHaveCount(0);

  await rankCurrent(page, 1);
  await expect(page.getByTestId("viewer-rank")).toHaveText("1ST");
  await page.keyboard.press("ArrowRight");
  await expect(
    viewer.getByRole("heading", { name: "Snap 2 of 3" }),
  ).toBeVisible();
  await rankCurrent(page, 2);
  await page.getByRole("button", { name: "Next snap" }).click();
  await expect(
    viewer.getByRole("heading", { name: "Snap 3 of 3" }),
  ).toBeVisible();
  await rankCurrent(page, 3);

  await expect(filledSlots(page)).toHaveCount(3);
  await expect(page.getByTestId("vote-summary")).toContainText("3/3 PICKED");

  await page.keyboard.press("Escape");
  await expect(page.locator(".gb-window")).toBeHidden();
  await openBallot(page);
  await openSnapViewer(page, 1);
  await expect(filledSlots(page)).toHaveCount(3);
  await expect(page.getByTestId("viewer-rank")).toHaveText("1ST");

  const mine = await page.request.get("/api/votes/mine");
  expect(ballotSchema.parse(await mine.json()).photoIds).toHaveLength(3);
  expect(identified).toEqual([]);
});

test("a rank taken off one snap moves onto another, with no modal in the way", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await apiUpload(page, "voter");
  await page.context().clearCookies();
  await apiSignIn(page, "judge");

  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);
  await openBallot(page);
  await openSnapViewer(page, 1);
  await rankCurrent(page, 1);
  await page.getByRole("button", { name: "Next snap" }).click();
  await rankCurrent(page, 2);
  await expect(filledSlots(page)).toHaveCount(2);

  await page.getByRole("button", { name: "Next snap" }).click();
  await rankCurrent(page, 2);
  await expect(page.getByTestId("viewer-note")).toHaveText(
    "2ND MOVED FROM ANOTHER SNAP",
  );
  await expect(page.getByTestId("viewer-rank")).toHaveText("2ND");
  await expect(filledSlots(page)).toHaveCount(2);

  await page.getByRole("button", { name: "2ND", exact: true }).click();
  await expect(
    page.locator(".gb-window").getByRole("heading", { name: "Snap 3 of 3" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous snap" }).click();
  await expect(
    page.locator(".gb-window").getByRole("heading", { name: "Snap 2 of 3" }),
  ).toBeVisible();
  await expect(page.getByTestId("viewer-rank")).toHaveText("UNRANKED");
});

test("tapping a snap's own rank clears it, and the ballot saves without it", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await page.context().clearCookies();
  await apiSignIn(page, "judge");

  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);
  await openBallot(page);
  await openSnapViewer(page, 1);

  await rankCurrent(page, 1);
  await page.getByRole("button", { name: "Next snap" }).click();
  await rankCurrent(page, 2);
  await expect(filledSlots(page)).toHaveCount(2);

  await rankCurrent(page, 2);
  await expect(page.getByTestId("viewer-rank")).toHaveText("UNRANKED");
  await expect(filledSlots(page)).toHaveCount(1);
  await expect(page.getByTestId("vote-summary")).toContainText("1/3 PICKED");

  const mine = await page.request.get("/api/votes/mine");
  expect(ballotSchema.parse(await mine.json()).photoIds).toHaveLength(1);
});

test("your own snap is on the ballot: visible, commentable, never rankable", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");

  for (const who of ["tester", "rival"] as const) {
    await page.context().clearCookies();
    await apiSignIn(page, who);
    await page.goto("/");
    await pressStart(page);
    await walkToVotingNpc(page);
    const dialog = await openBallot(page);
    const grid = dialog.getByTestId("vote-candidates");
    await expect(grid.getByRole("button")).toHaveCount(2);
    await expect(grid.getByText("YOURS")).toHaveCount(1);

    await openSnapViewer(page, who === "tester" ? 1 : 2);
    await expect(page.getByTestId("viewer-rank")).toHaveText("YOURS");
    await expect(page.getByTestId("viewer-own")).toBeVisible();
    for (const rank of ["1ST", "2ND", "3RD"]) {
      await expect(
        page.getByRole("button", { name: `Rank ${rank}` }),
      ).toBeDisabled();
    }
    await expect(page.getByTestId("photo-comments")).toBeVisible();
    await expect(filledSlots(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
});

test("the NPC says what skipping the day costs, and so does the ballot", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await page.context().clearCookies();
  await apiSignIn(page, "judge");

  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);

  await page.keyboard.press("Enter");
  const text = page.getByTestId("dialogue-text");
  await expect(text).toBeVisible();
  await expect(text).not.toContainText("50%");
  const choices = await readDialogue(page);
  await expect(text).toContainText("50%");
  await expect(
    choices.getByRole("button", { name: "View photos" }),
  ).toBeVisible();

  const dialog = await openBallot(page);
  const warning = dialog.getByTestId("vote-penalty");
  await expect(warning).toContainText("50%");

  await openSnapViewer(page, 1);
  await expect(page.getByTestId("vote-penalty")).toBeVisible();
  await rankCurrent(page, 1);
  await expect(page.getByTestId("vote-penalty")).toBeHidden();
});

test("tapping the photograph pages the ballot and ranks nothing", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await apiUpload(page, "voter");
  await page.context().clearCookies();
  await apiSignIn(page, "judge");

  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);
  await openBallot(page);
  const viewer = await openSnapViewer(page, 1);
  const title = (at: number) =>
    viewer.getByRole("heading", { name: `Snap ${at} of 3` });
  await expect(title(1)).toBeVisible();

  // Measured off the photograph's own box: a zone reaching past it would swallow the
  // tap a rank button wanted, and "visible" says nothing about that.
  const photo = await boxOf(page, "viewer-photo");
  const back = await boxOf(page, "viewer-tap-back");
  const on = await boxOf(page, "viewer-tap-on");
  expect(Math.abs(back.width + on.width - photo.width)).toBeLessThan(2);
  expect(Math.abs(back.height - photo.height)).toBeLessThan(2);
  expect(on.x).toBeGreaterThan(back.x);
  expect(on.y + on.height).toBeLessThanOrEqual(photo.y + photo.height + 1);

  await tapViewer(page, "on");
  await expect(title(2)).toBeVisible();
  await tapViewer(page, "back");
  await expect(title(1)).toBeVisible();
  await tapViewer(page, "back");
  await expect(title(3)).toBeVisible();

  // Three taps landed and nothing was ranked — with the readout and the podium behind
  // it, since "no rank" passes just as happily against taps that never arrived.
  await expect(page.getByTestId("viewer-rank")).toHaveText("UNRANKED");
  await expect(filledSlots(page)).toHaveCount(0);
  await expect(page.getByTestId("vote-summary")).toContainText("0/3 PICKED");

  await rankCurrent(page, 1);
  await expect(page.getByTestId("viewer-rank")).toHaveText("1ST");
  await expect(title(3)).toBeVisible();

  // TYPED, not filled: `fill` sets the value without a single keydown, and the keys this
  // viewer holds are exactly the ones a comment is made of — `KEY_DIRS` reads A and D as
  // walking, so a swallowed letter is what this asserts against.
  const thread = page.getByTestId("photo-comments");
  const field = thread.getByPlaceholder("Add a comment…");
  await field.click();
  await expect(title(3)).toBeVisible();
  await field.pressSequentially("that fence, though");
  await expect(field).toHaveValue("that fence, though");
  await expect(title(3)).toBeVisible();
  await thread.getByRole("button", { name: "Send" }).click();
  await expect(thread).toContainText("that fence, though");
  await expect(title(3)).toBeVisible();
  await expect(page.getByTestId("viewer-rank")).toHaveText("1ST");
});

test("the ballot is for signed-in friends only", async ({ page }) => {
  await apiUpload(page, "tester");
  await page.context().clearCookies();

  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);
  await expect(page.getByText(/sign in to vote/i)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".gb-window").getByRole("heading", { name: "Sign in" }),
  ).toBeVisible();
  await expect(page.getByTestId("podium")).toBeHidden();
});
