import { JURIES } from "../shared/juries";
import { apiSignIn, expect, pressStart, test, TINY_PNG } from "./fixtures";

// Not day 1's jury: the bench answers about whoever was picked, never about whoever
// happens to be judging today.
const PICKED = JURIES[11] ?? JURIES[0];

const SOURCE = { name: "bench.png", mimeType: "image/png", buffer: TINY_PNG };

test("the bench is the operator's alone", async ({ page }) => {
  await apiSignIn(page, "rival");
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("rival");

  await page.getByTestId("select-button").click();
  const choices = page.getByTestId("dialogue-choices");
  await expect(
    choices.getByRole("button", { name: "Install app" }),
  ).toBeVisible();
  await expect(
    choices.getByRole("button", { name: "Jury bench" }),
  ).toBeHidden();

  const refused = await page.request.post("/api/admin/bench", {
    multipart: { jury: "0", photo: SOURCE },
  });
  expect(refused.status()).toBe(403);
});

test("an admin picks a jury, hands it a photo and reads the bench back", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  await page.getByTestId("select-button").click();
  await page
    .getByTestId("dialogue-choices")
    .getByRole("button", { name: "Jury bench" })
    .click();
  const bench = page.getByTestId("jury-bench");
  await expect(bench).toBeVisible();

  const chosen = bench.getByRole("button", {
    name: `${PICKED.name} — ${PICKED.theme}`,
  });
  await expect(bench.locator("li")).toHaveCount(JURIES.length);
  await chosen.click();
  await expect(chosen).toHaveAttribute("aria-pressed", "true");

  const press = bench.getByTestId("bench-try");
  await expect(press).toHaveText(new RegExp(`Try ${PICKED.name}`));

  // The picker has to open inside the press itself — a `click()` deferred into a
  // promise chain loses the gesture and Safari refuses. Waiting on the chooser is
  // what says the press opened it, rather than the test filling a hidden input.
  const picker = page.waitForEvent("filechooser");
  const answered = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/api/admin/bench"),
  );
  await press.click();
  await (await picker).setFiles(SOURCE);

  // No Playwright environment has a GEMINI_API_KEY, so this is the only answer a
  // spec can walk to: the readable offline, not a verdict.
  expect((await answered).status()).toBe(503);
  await expect(bench.getByTestId("bench-note")).toContainText(/offline/i);
  await expect(bench.getByTestId("bench-verdict")).toBeHidden();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(bench).toBeHidden();
});
