import { dayPhotosSchema } from "../shared/api";
import {
  apiSignIn,
  apiSpendQuota,
  expect,
  expectConsoleRefused,
  expectDrawMeRefused,
  openConsole,
  pressStart,
  test,
  TINY_PNG,
  walkToArtist,
} from "./fixtures";

test("an admin can read the day's jury batch and run it again", async ({
  page,
}) => {
  await apiSignIn(page);
  const upload = await page.request.post("/api/photos", {
    multipart: {
      photo: { name: "snap.png", mimeType: "image/png", buffer: TINY_PNG },
    },
  });
  expect(upload.status()).toBe(201);

  // The ranking runs in `waitUntil` behind the description, so it lands after the 201:
  // poll the API for it rather than the screen.
  await expect
    .poll(async () => {
      const res = await page.request.get("/api/admin/days/1/photos");
      return dayPhotosSchema.parse(await res.json()).ranking.generated;
    })
    .toBe(true);

  const panel = await openConsole(page, "Snaps");
  const state = panel.getByTestId("ops-ranked");
  // No Playwright environment has a GEMINI_API_KEY, so the day is ranked by the
  // fallback and the run says so — the readable answer, not a crash.
  await expect(state).toContainText("Ranked");
  await expect(state).toContainText(/last run failed/i);

  await panel.getByTestId("ops-rank-day").click();
  await expect(panel.getByTestId("ops-snaps-note")).toContainText(
    /Day 1 — Ranked/,
  );
  await expect(state).toContainText(/last run failed/i);
});

test("only an admin can read who has spent what of the avatar machine", async ({
  page,
}) => {
  await apiSignIn(page, "rival");
  await apiSpendQuota(page, 4);
  await expectConsoleRefused(page);
  expect((await page.request.get("/api/admin/avatars")).status()).toBe(403);

  await apiSignIn(page, "tester");
  const panel = await openConsole(page, "Avatars");
  // Alphabetical, and every friend is on it including the ones on nought.
  await expect(panel.getByTestId("ops-avatar-roster")).toHaveText(
    /JUDGE\s*0\s*RIVAL\s*4\s*TESTER\s*0\s*VOTER\s*0/,
  );
  await expect(panel.getByTestId("ops-avatar-day-total")).toHaveText("4");
  await expect(panel.getByTestId("ops-avatar-all-time")).toHaveText("4");
  await expect(panel.getByTestId("ops-avatar-estimate")).toHaveText(
    /~0\.18 USD/,
  );
  await expect(panel).toContainText(/an estimate/i);
  // The caps come back prefilled with what is in force, not with a placeholder.
  await expect(panel.getByTestId("ops-cap-daily")).toHaveValue("10");
  await expect(panel.getByTestId("ops-cap-town")).toHaveValue("50");
});

test("an admin can close the machine, and the artist then says no at the choice", async ({
  page,
}) => {
  await apiSignIn(page, "tester");
  const panel = await openConsole(page, "Avatars");

  const townCap = panel.getByTestId("ops-cap-town");
  // The fields start EMPTY and are filled from the GET, and the adoption at render time
  // overwrites whatever was typed before that landed — so wait for the prefill first or
  // this test quietly saves 50 back over its own 0.
  await expect(townCap).toHaveValue("50");
  await townCap.fill("0");
  const saved = page.waitForResponse(
    (res) =>
      res.request().method() === "PATCH" &&
      res.url().includes("/api/admin/avatars"),
  );
  await panel.getByTestId("ops-caps-save").click();
  // Awaited before the navigation below, which would otherwise abort it in flight.
  expect((await saved).status()).toBe(200);

  await page.goto("/");
  await pressStart(page);
  await walkToArtist(page);
  await page.keyboard.press("Enter");
  await expectDrawMeRefused(page);
});
