import {
  apiSignIn,
  apiUpload,
  expect,
  jukeboxPixel,
  JUKEBOX_LAMP,
  JUKEBOX_WOOD,
  joinAs,
  pressStart,
  readEvent,
  test,
  walkToJukebox,
} from "./fixtures";
import type { Page } from "@playwright/test";
import { jukeboxStateSchema } from "../shared/jukebox";

/** Read off the AUTHORITY: the DO holds what is on, and there is no public GET, so a press
 * is confirmed by the response it answered with rather than by anything on screen. */
async function pressPlay(page: Page): Promise<string> {
  const answered = page.waitForResponse(
    (res) =>
      res.url().includes("/api/jukebox") && res.request().method() === "POST",
  );
  await page.getByTestId("jukebox-play").click();
  const res = await answered;
  expect(res.status()).toBe(200);
  const state = jukeboxStateSchema.parse(await res.json());
  const trackId = state.playing?.trackId;
  if (trackId === undefined) throw new Error("the press put nothing on");
  return trackId;
}

async function openSelector(page: Page) {
  await walkToJukebox(page);
  await page.keyboard.press("Enter");
  const selector = page.getByTestId("jukebox");
  await expect(selector).toBeVisible();
  return selector;
}

/** The shelf WRAPS, so a walk looking for a record that is not on it never ends. */
const SHELF_BOUND = 200;

/** Flicks to a named tone rather than pressing whatever faces first. `dropNeedle` reads a
 * duration off the file before it presses, and on a three-minute record that read alone can
 * outlast the five-second cooldown — which is how a test ABOUT the cooldown gets a 200. */
async function faceTone(page: Page, title: string) {
  const artist = page.getByTestId("jukebox-artist");
  const faced = page.getByTestId("jukebox-title");
  for (let step = 0; step < SHELF_BOUND; step += 1) {
    if (
      (await artist.textContent()) === "Test Pattern" &&
      (await faced.textContent()) === title
    ) {
      return;
    }
    await page.keyboard.press("ArrowRight");
  }
  throw new Error(`no Test Pattern record titled ${title} on the shelf`);
}

test("plays one record to every screen in the town, an anonymous one included", async ({
  page,
  browser,
}) => {
  // The fixture's own page is ANONYMOUS, which is the point: it hears the record and can
  // press nothing.
  await page.goto("/");
  await pressStart(page);
  expect(await jukeboxPixel(page)).toEqual(JUKEBOX_WOOD);

  const presser = await joinAs(browser, "tester");
  const friend = await joinAs(browser, "voter");
  try {
    // Both signed-in friends stand at the cabinet BEFORE anything is put on, so the walk
    // does not eat the record it is going to watch.
    await openSelector(presser);
    await walkToJukebox(friend);

    const put = await pressPlay(presser);

    await expect
      .poll(async () => (await jukeboxPixel(page)).join())
      .toBe(JUKEBOX_LAMP.join());
    await expect(presser.getByTestId("jukebox-note")).toContainText(put);

    await friend.keyboard.press("Enter");
    await friend.getByTestId("jukebox-stop").click();
    await expect
      .poll(async () => (await jukeboxPixel(page)).join())
      .toBe(JUKEBOX_WOOD.join());
  } finally {
    await presser.context().close();
    await friend.context().close();
  }
});

test("puts a screen that loads mid-record where the record already is", async ({
  page,
  browser,
}) => {
  const presser = await joinAs(browser, "tester");
  try {
    await openSelector(presser);
    await pressPlay(presser);

    // This page has not loaded yet, so what it knows comes from the socket's greeting.
    await page.goto("/");
    await pressStart(page);
    await expect
      .poll(async () => (await jukeboxPixel(page)).join())
      .toBe(JUKEBOX_LAMP.join());
  } finally {
    await presser.context().close();
  }
});

test("steps the shelf the same way from the buttons, the arrow keys and a sleeve", async ({
  page,
}) => {
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await openSelector(page);

  const title = page.getByTestId("jukebox-title");
  const faced = await title.textContent();

  await page.getByRole("button", { name: "Next record" }).click();
  const next = await title.textContent();
  expect(next).not.toBe(faced);

  await page.getByRole("button", { name: "Previous record" }).click();
  await expect(title).toHaveText(faced ?? "");

  await page.keyboard.press("ArrowRight");
  await expect(title).toHaveText(next ?? "");
  await page.keyboard.press("ArrowLeft");
  await expect(title).toHaveText(faced ?? "");

  await page.getByTestId("jukebox-sleeve-1").click();
  await expect(title).toHaveText(next ?? "");
});

test("backs out of the selector and leaves the record playing", async ({
  page,
}) => {
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await openSelector(page);
  await pressPlay(page);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("jukebox")).toBeHidden();
  await expect(page.getByTestId("player-pos")).toBeVisible();
  await expect
    .poll(async () => (await jukeboxPixel(page)).join())
    .toBe(JUKEBOX_LAMP.join());
});

test("closes the selector when an event starts, and refuses a record while one is live", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await openSelector(page);

  // Started through the operator's own route rather than the SELECT menu, which is dead
  // while a dialog is up: the claim here is about a selector that was ALREADY open.
  expect((await page.request.post("/api/admin/event/start")).status()).toBe(
    200,
  );
  await expect
    .poll(async () => (await readEvent(page)).phase)
    .not.toBe("submission");
  // `SURVIVES_EVENT` says no, so the box goes WITH the countdown rather than being painted
  // over by the opaque overlay.
  await expect(page.getByTestId("jukebox")).toBeHidden();

  // Asserted POSITIVELY — the 409 itself — because "nothing happened" passes just as happily
  // against a request that never landed. Driven at the route because there is no selector on
  // screen to press: the printed refusal is the test below, on the cooldown a player can
  // actually reach.
  const refused = await page.request.post("/api/jukebox", {
    data: { trackId: "Test Pattern - Bleep", durationMs: 1000 },
  });
  expect(refused.status()).toBe(409);
});

test("prints the cabinet's own refusal rather than swallowing it", async ({
  page,
}) => {
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await openSelector(page);
  await faceTone(page, "Bleep");
  await pressPlay(page);

  // A second press on this presser's heels is the cooldown, and the reason comes off the
  // route rather than out of a string this screen made up.
  const refused = page.waitForResponse(
    (res) =>
      res.url().includes("/api/jukebox") && res.request().method() === "POST",
  );
  await page.getByTestId("jukebox-play").click();
  expect((await refused).status()).toBe(409);
  await expect(page.getByTestId("jukebox-note")).toContainText(/settle/i);
});

test("tells a signed-out visitor to sign in rather than opening onto a 401", async ({
  page,
}) => {
  await page.goto("/");
  await pressStart(page);
  await walkToJukebox(page);
  await expect(page.getByText(/sign in to put a record on/i)).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("jukebox")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
