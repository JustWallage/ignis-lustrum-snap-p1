import type { Page } from "@playwright/test";
import { clockSchema, dayPhotosSchema } from "../shared/api";
import {
  ADMIN_PATH,
  apiSignIn,
  apiUpload,
  expect,
  expectConsoleRefused,
  joinAs,
  openConsole,
  pressStart,
  recordSockets,
  test,
  TINY_PNG,
} from "./fixtures";

async function setDayTo(page: Page, day: number) {
  const panel = await openConsole(page, "Clock");
  await panel.getByTestId("ops-day-input").fill(String(day));
  await panel.getByTestId("ops-day-set").click();
  await panel.getByTestId("ops-day-set-yes").click();
  return panel;
}

test("the console fills the screen, opens no socket and mounts no modal", async ({
  page,
}) => {
  await apiSignIn(page);
  // Installed before the navigation, because what is under test is a connection that
  // must never be made.
  await recordSockets(page);
  // The `websocket` event, not `request`: Playwright surfaces a handshake there and
  // nowhere else, so a request listener would pass whatever the page did.
  const handshakes: string[] = [];
  page.on("websocket", (socket) => {
    handshakes.push(socket.url());
  });

  const panel = await openConsole(page);
  await expect(panel.getByTestId("ops-clock")).toContainText("Day 1");

  // A socket rendering no Overworld announces no position, so "no new player on the
  // roster" would pass against the bug it claims to catch. The CONNECTION is the claim.
  expect(handshakes.filter((url) => url.includes("/api/ws"))).toEqual([]);
  // FILTERED, not counted: in dev the recorder also catches Vite's own HMR socket, so a
  // bare count is 1 here and 0 in CI against the deployed Worker.
  const opened = await page.evaluate(() =>
    (window.__ignisSockets ?? []).map((socket) => socket.url),
  );
  expect(opened.filter((url) => url.includes("/api/ws"))).toEqual([]);

  // `Modal.tsx` is a native <dialog>: none is on this surface, and no panel is a
  // little centred window.
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.locator(".gb-window")).toHaveCount(0);

  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null)
    throw new Error("no console on screen");
  expect(box.height).toBeGreaterThan(viewport.height * 0.9);
  expect(box.width).toBeGreaterThan(viewport.width * 0.9);
});

test("a friend and a stranger are both refused, screen and route alike", async ({
  page,
}) => {
  await expectConsoleRefused(page);
  expect(
    (await page.request.post("/api/admin/day", { data: { day: 2 } })).status(),
  ).toBe(401);

  await apiSignIn(page, "rival");
  await expectConsoleRefused(page);
  for (const path of [
    "/api/admin/day",
    "/api/admin/photos/1/retire",
    "/api/admin/days/1/retire",
  ]) {
    const refused = await page.request.post(path, { data: { day: 2 } });
    expect(refused.status(), path).toBe(403);
  }
  for (const path of ["/api/admin/images", "/api/admin/days/1/photos"]) {
    expect((await page.request.get(path)).status(), path).toBe(403);
  }

  await page.goto("/");
  await pressStart(page);
  await page.getByTestId("select-button").click();
  const choices = page.getByTestId("dialogue-choices");
  await expect(
    choices.getByRole("button", { name: "Install app" }),
  ).toBeVisible();
  await expect(
    choices.getByRole("button", { name: "Admin console" }),
  ).toBeHidden();
});

test("the SELECT menu carries the operator to the console and nothing else", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await page.getByTestId("select-button").click();

  const choices = page.getByTestId("dialogue-choices");
  // The four the console absorbed are gone; the three event ones are pressed by
  // somebody standing in the room while it runs and stay here.
  for (const gone of ["Avatar counts", "Prize manager", "Jury bench"]) {
    await expect(choices.getByRole("button", { name: gone })).toBeHidden();
  }
  await expect(choices.getByRole("button", { name: /^Retry AI/ })).toBeHidden();
  await expect(
    choices.getByRole("button", { name: "Start event" }),
  ).toBeVisible();

  await choices.getByRole("button", { name: "Admin console" }).click();
  await expect(page.getByTestId("ops-console")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(ADMIN_PATH);
});

test("the operator winds the clock and an open town screen follows it", async ({
  page,
  browser,
}) => {
  await apiSignIn(page);
  const town = await joinAs(browser, "rival");
  try {
    await expect(town.getByTestId("game-day")).toHaveText("DAY 1");

    const panel = await setDayTo(page, 5);
    await expect(panel.getByTestId("ops-clock-note")).toContainText(
      "Day 5 — no awards dropped.",
    );
    await expect(panel.getByTestId("ops-clock")).toContainText("Day 5");
    // No reload anywhere: the town screen is the one that was already open.
    await expect(town.getByTestId("game-day")).toHaveText("DAY 5");

    await setDayTo(page, 1);
    await expect(town.getByTestId("game-day")).toHaveText("DAY 1");
  } finally {
    await town.context().close();
  }
});

test("the clock reads what the day holds back, and the console names nobody", async ({
  page,
}) => {
  await apiUpload(page, "rival");
  await apiSignIn(page);

  const panel = await openConsole(page, "Snaps");
  const cards = panel.getByTestId("ops-snap");
  await expect(cards).toHaveCount(1);
  // `toPhoto` masks the name and the verdict as two decisions and masks both for an
  // admin too, so an unrevealed day is a grid of pictures and ids.
  await expect(cards.first()).not.toContainText("rival");
  await expect(cards.first()).not.toContainText("Jury");
  await expect(panel.getByTestId("ops-clock")).toContainText("1 in");
});

test("retiring a snap frees the day and leaves the picture in the bucket", async ({
  page,
}) => {
  const id = await apiUpload(page, "rival");
  await apiSignIn(page);

  const panel = await openConsole(page, "Snaps");
  await expect(panel.getByTestId("ops-snap")).toHaveCount(1);
  await panel.getByTestId(`ops-retire-${String(id)}`).click();
  await panel.getByTestId(`ops-retire-${String(id)}-yes`).click();

  await expect(panel.getByTestId("ops-snaps-note")).toContainText(
    "1 snap retired out of day 1",
  );
  await expect(panel.getByTestId("ops-snap")).toHaveCount(0);
  await expect(panel.getByTestId("ops-clock")).toContainText("0 in");

  // The slot the row occupied is free, so the player re-shoots the same day: 201, and
  // not the 409 `photos_user_day_idx` answers a second submission with.
  await apiSignIn(page, "rival");
  const again = await page.request.post("/api/photos", {
    multipart: {
      photo: { name: "snap.png", mimeType: "image/png", buffer: TINY_PNG },
    },
  });
  expect(again.status()).toBe(201);

  await apiSignIn(page);
  const listed = await page.request.get("/api/admin/days/1/photos");
  expect(dayPhotosSchema.parse(await listed.json()).photos).toHaveLength(1);
});

test("the bucket lists the retired snap under retired, and renders its bytes", async ({
  page,
}) => {
  const id = await apiUpload(page, "rival");
  await apiSignIn(page);
  const retired = await page.request.post(
    `/api/admin/photos/${String(id)}/retire`,
  );
  expect(retired.status()).toBe(200);

  const panel = await openConsole(page, "Bucket");
  await expect(panel.getByTestId("ops-bucket-retired")).toContainText("1 · ");
  await expect(panel.getByTestId("ops-bucket-orphaned")).toContainText("0 · ");
  const card = panel.getByTestId("ops-retired").first();
  await expect(card).toContainText("Day 1");
  await expect(card).toContainText("rival");
  // Served by KEY out of the admin router: the `photos` row naming it has gone.
  const shot = card.locator("img");
  await expect
    .poll(async () =>
      shot.evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
});

test("retiring the whole day empties it in one press", async ({ page }) => {
  await apiUpload(page, "rival");
  await apiUpload(page, "voter");
  await apiSignIn(page);

  const panel = await openConsole(page, "Snaps");
  await expect(panel.getByTestId("ops-snap")).toHaveCount(2);
  await panel.getByTestId("ops-retire-day").click();
  await panel.getByTestId("ops-retire-day-yes").click();

  await expect(panel.getByTestId("ops-snaps-note")).toContainText(
    "2 snaps retired out of day 1",
  );
  await expect(panel.getByTestId("ops-snaps-empty")).toBeVisible();
  await expect(panel.getByTestId("ops-clock")).toContainText("0 in");

  const clock = await page.request.post("/api/admin/day", {
    data: { day: 1 },
  });
  expect(clockSchema.parse(await clock.json()).submissionCount).toBe(0);
});
