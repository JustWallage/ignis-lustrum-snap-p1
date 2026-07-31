import { failedEvaluationsSchema } from "../shared/api";
import {
  apiSignIn,
  apiSpendQuota,
  expect,
  expectDrawMeRefused,
  pressStart,
  test,
  TINY_PNG,
  walkToArtist,
} from "./fixtures";

test("an admin can see the day's broken verdicts and retry them", async ({
  page,
}) => {
  await apiSignIn(page);
  const upload = await page.request.post("/api/photos", {
    multipart: {
      photo: { name: "snap.png", mimeType: "image/png", buffer: TINY_PNG },
    },
  });
  expect(upload.status()).toBe(201);

  await expect
    .poll(async () => {
      const res = await page.request.get("/api/admin/evaluate");
      return failedEvaluationsSchema.parse(await res.json()).failed;
    })
    .toBe(1);

  await page.goto("/");
  await pressStart(page);
  const choices = page.getByTestId("dialogue-choices");
  const retry = choices.getByRole("button", { name: /^Retry AI/ });

  await page.getByTestId("select-button").click();
  await expect(retry).toHaveText(/Retry AI: 1/);

  await retry.click();
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /broke it a second time/i,
  );
  await expect(choices).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("dialogue-text")).toBeHidden();
});

test("only an admin can read who has spent what of the avatar machine", async ({
  page,
}) => {
  await apiSignIn(page, "rival");
  await apiSpendQuota(page, 4);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("rival");

  const choices = page.getByTestId("dialogue-choices");
  const counts = choices.getByRole("button", { name: "Avatar counts" });
  await page.getByTestId("select-button").click();
  await expect(
    choices.getByRole("button", { name: "Install app" }),
  ).toBeVisible();
  await expect(counts).toBeHidden();
  await expect(choices.getByText(/\b4\b/)).toBeHidden();
  expect((await page.request.get("/api/admin/avatars")).status()).toBe(403);
  await page.keyboard.press("Escape");

  await apiSignIn(page, "tester");
  await page.reload();
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("tester");
  await page.getByTestId("select-button").click();
  await expect(counts).toBeVisible();
  await counts.click();

  const machine = page.getByTestId("avatar-machine");
  await expect(machine).toBeVisible();
  // Alphabetical, and every friend is on it including the ones on nought.
  await expect(machine.getByTestId("avatar-roster")).toHaveText(
    /JUDGE\s*0\s*RIVAL\s*4\s*TESTER\s*0\s*VOTER\s*0/,
  );
  await expect(machine.getByTestId("avatar-day-total")).toHaveText("4");
  await expect(machine.getByTestId("avatar-all-time")).toHaveText("4");
  await expect(machine.getByTestId("avatar-estimate")).toHaveText(/~0\.18 USD/);
  await expect(machine).toContainText(/an estimate/i);
  // The caps come back prefilled with what is in force, not with a placeholder.
  await expect(machine.getByTestId("avatar-cap-daily")).toHaveValue("10");
  await expect(machine.getByTestId("avatar-cap-town")).toHaveValue("50");
});

test("an admin can close the machine, and the artist then says no at the choice", async ({
  page,
}) => {
  await apiSignIn(page, "tester");
  await page.goto("/");
  await pressStart(page);
  await page.getByTestId("select-button").click();
  await page
    .getByTestId("dialogue-choices")
    .getByRole("button", { name: "Avatar counts" })
    .click();

  const machine = page.getByTestId("avatar-machine");
  const townCap = machine.getByTestId("avatar-cap-town");
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
  await machine.getByTestId("avatar-caps-save").click();
  // Awaited before the reload below, which would otherwise abort it in flight.
  expect((await saved).status()).toBe(200);
  await page.getByRole("button", { name: "Close" }).click();

  // Reloaded rather than walked straight over: the artist's refusal reads the quota this
  // screen fetched at startup, which the PATCH has no way to reach into.
  await page.reload();
  await pressStart(page);
  await walkToArtist(page);
  await page.keyboard.press("Enter");
  await expectDrawMeRefused(page);
});
