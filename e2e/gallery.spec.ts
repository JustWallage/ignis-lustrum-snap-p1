import {
  apiSignIn,
  apiUpload,
  expect,
  handSnapToJury,
  openArchive,
  openConsole,
  pressStart,
  setDay,
  test,
  TINY_PNG,
  walkToShelf,
} from "./fixtures";
import type { Page, Route } from "@playwright/test";

interface Held {
  release: () => void;
}

/** Holds every matching request until released, so a progress readout can be read on a
 * server that would otherwise answer faster than the assertion. */
async function holdRoute(page: Page, pattern: string): Promise<Held> {
  let open = () => {
    // Replaced below, before any route can reach it.
  };
  const gate = new Promise<void>((resolve) => {
    open = () => {
      resolve();
    };
  });
  await page.route(pattern, async (route: Route) => {
    await gate;
    await route.continue();
  });
  return {
    release: () => {
      open();
    },
  };
}

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

test("a photographer can share the moment they hand it in, and it waits for the reveal", async ({
  page,
}) => {
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await handSnapToJury(page, {
    name: "snap.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });

  // The window the upload lands on, on the day it was taken — so the switch is live and
  // the page is not, and the note has to say which.
  const dialog = page.locator(".gb-window");
  await expect(dialog.getByTestId("public-share")).toHaveText("PRIVATE");
  await dialog.getByTestId("public-share").click();
  await expect(dialog.getByTestId("public-share")).toHaveText("PUBLIC");
  await expect(dialog.getByTestId("public-note")).toContainText(
    /goes on the public page when this day is revealed/i,
  );

  await page.context().clearCookies();
  await page.goto(GALLERY);
  await expect(page.getByTestId("gallery-empty")).toBeVisible();

  // The day turns over and the decision made at upload time takes effect with no
  // second press.
  await apiSignIn(page, "tester");
  await setDay(page, 2);
  await page.context().clearCookies();
  await page.goto(GALLERY);
  await expect(page.getByTestId("gallery-tile")).toHaveCount(1);
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

  // The ONE snap's own button, not the sweep beside it: `ops-describe-all` matches a
  // loose `ops-describe-` too, and it is the per-press spinner under test here.
  const describe = panel.getByTestId(/^ops-describe-\d+$/);
  await describe.first().click();
  await expect(describe.first()).toContainText("Reading it");
  await expect(panel.getByTestId("ops-pending")).toBeVisible();
  await expect(panel.getByTestId("ops-rank-day")).toBeDisabled();
  await expect(panel.getByTestId("ops-pending")).toHaveCount(0, {
    timeout: 20_000,
  });
});

test("the console sweeps the day's unread snaps one at a time, live", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await apiUpload(page, "voter");
  await apiSignIn(page, "tester");
  const panel = await openConsole(page, "Snaps");

  const sweep = panel.getByTestId("ops-describe-all");
  await expect(sweep).toContainText("Describe the 3 the jury cannot read");

  // Held open so the progress can be READ: a local worker answers faster than a
  // human, and "one at a time, live" is the claim being made.
  const held = await holdRoute(page, "**/api/admin/photos/*/describe");
  await sweep.click();
  await expect(panel.getByTestId("ops-snaps-note")).toContainText(
    /Reading 1 of 3/,
  );
  await expect(panel.getByTestId("ops-describe-stop")).toBeVisible();
  held.release();

  // No Gemini key in e2e, so all three come back FAILED — and the sweep finishes them
  // rather than stopping, because one photograph Gemini refused says nothing about the
  // next. Each row ends up carrying its own reason instead of a blank.
  await expect(panel.getByTestId("ops-snaps-note")).toContainText(
    /Read 3 of 3/,
    { timeout: 20_000 },
  );
  const failed = panel.getByText("Description failed");
  await expect(failed).toHaveCount(3);
});

test("the console offers the jury's models and keys, and defaults to neither", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  const panel = await openConsole(page, "Snaps");

  const model = panel.getByTestId("ops-model");
  await expect(model).toHaveValue("");
  // The allowlist is `JURY_MODELS`, which the e2e project cannot import from `shared/`
  // — so this names the default the repo actually runs on and nothing more.
  await expect(model.locator("option")).toContainText(["Default"]);
  await model.selectOption("gemini-3.6-flash");
  await expect(model).toHaveValue("gemini-3.6-flash");

  // Spending the bill is a CHOICE, so the dropdown opens on the standing rule and the
  // operator has to move it.
  const spend = panel.getByTestId("ops-spend");
  await expect(spend).toHaveValue("default");
  await spend.selectOption("billed");
  await expect(spend).toHaveValue("billed");
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
