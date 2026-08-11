import { avatarStateSchema } from "../shared/api";
import { ARTIST } from "../shared/map";
import {
  apiSignIn,
  apiSpendQuota,
  apiStoreAvatar,
  dailyLimit,
  expect,
  expectDrawMeRefused,
  pressStart,
  readDialogue,
  test,
  TINY_PNG,
  walkToArtist,
} from "./fixtures";

// `initPwa` registers a worker that `clients.claim()`s this page, and Playwright does
// not route service-worker-initiated requests — so the `page.route` intercepts below
// would race the worker for the `/api/avatar` POST. Block it: nothing here tests PWA.
test.use({ serviceWorkers: "block" });

const SOURCE = { name: "me.png", mimeType: "image/png", buffer: TINY_PNG };

test("the SELECT menu no longer offers the avatar editor", async ({ page }) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("tester");

  const choices = page.getByTestId("dialogue-choices");
  await page.getByTestId("select-button").click();
  await expect(
    choices.getByRole("button", { name: "Install app" }),
  ).toBeVisible();
  await expect(
    choices.getByRole("button", { name: /avatar editor/i }),
  ).toBeHidden();
});

test("an anonymous walker talking to the artist is asked to sign in", async ({
  page,
}) => {
  await page.goto("/");
  await pressStart(page);

  await walkToArtist(page);
  await expect(page.getByText(/sign in for an avatar/i)).toBeVisible();
  await page.keyboard.press("Enter");

  const dialog = page.locator(".gb-window");
  await expect(dialog.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(dialog.getByText(/signed-in friends only/i)).toBeVisible();
});

test("picking a photo starts the drawing, with no dialog in between", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("tester");

  await walkToArtist(page);
  await expect(page.getByText(/have your avatar drawn/i)).toBeVisible();
  await page.keyboard.press("Enter");

  const patter = page.getByTestId("dialogue-text");
  await expect(patter).toContainText(/AVATAR ARTIST/);
  const choices = await readDialogue(page);
  await expect(patter).toContainText(/hand over any picture/i);
  await expect(patter).not.toContainText(/\d/);
  // [Draw me] [Wear an old one] [Cancel]. Counted rather than named, so a fourth
  // choice cannot appear here without somebody deciding it should.
  await expect(choices.getByRole("button")).toHaveCount(3);

  const dialog = page.locator(".gb-window");
  await choices.getByRole("button", { name: "Draw me" }).click();
  await expect(dialog).toBeHidden();

  // Held for a beat so the progress line is observable at all: against a local worker
  // the refusal can arrive before the page has finished typing itself out.
  await page.route("**/api/avatar", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    // Long enough for the page to type itself out at 26ms a character, not just
    // to appear: the assertion below reads words that are two thirds in.
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    return route.continue();
  });
  const drawing = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" && res.url().includes("/api/avatar"),
  );
  await page.getByTestId("avatar-file").setInputFiles(SOURCE);
  await expect(patter).toContainText(/hold very still/i);
  await expect(dialog).toBeHidden();
  expect((await drawing).status()).toBe(503);
  await page.unroute("**/api/avatar");

  await expect(patter).toContainText(/offline/i);
  await expect(dialog).toBeHidden();
  const quota = await page.request.get("/api/avatar");
  expect(quota.ok()).toBeTruthy();
  const state = avatarStateSchema.parse(await quota.json());
  expect(state.remaining).toBe(state.limit);

  await page.keyboard.press("Escape");
  await expect(patter).toBeHidden();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("player-pos")).toHaveAttribute(
    "data-x",
    String(ARTIST.x - 2),
  );
});

test("the artist says no before a picker opens once the quota is gone", async ({
  page,
}) => {
  await apiSignIn(page);
  await apiSpendQuota(page, await dailyLimit(page));
  await page.goto("/");
  await pressStart(page);
  await walkToArtist(page);
  await page.keyboard.press("Enter");
  await expectDrawMeRefused(page);

  await apiSpendQuota(page, 0);
  await page.keyboard.press("Escape");
  await page.reload();
  await pressStart(page);
  await walkToArtist(page);
  await page.keyboard.press("Enter");
  await (
    await readDialogue(page)
  )
    .getByRole("button", { name: "Draw me" })
    .click();
  await expect(page.getByTestId("dialogue-text")).not.toContainText(
    /all the ink/i,
  );
});

test("the splash is where a finished sprite arrives, and OK wears it", async ({
  page,
}) => {
  await apiSignIn(page);
  await apiStoreAvatar(page);
  const drawn = await page.request.get("/api/avatar");
  expect(drawn.ok()).toBeTruthy();
  const state: unknown = await drawn.json();
  await page.route("**/api/avatar", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({ status: 201, json: state });
  });

  await page.goto("/");
  await pressStart(page);
  await walkToArtist(page);
  await page.keyboard.press("Enter");
  const offer = await readDialogue(page);
  await offer.getByRole("button", { name: "Draw me" }).click();
  await page.getByTestId("avatar-file").setInputFiles(SOURCE);

  const splash = page.getByTestId("avatar-splash");
  await expect(splash).toBeVisible();
  await expect(splash.getByTestId("avatar-sprite")).toBeVisible();
  // What the town may spend is a money decision and this is the wrong screen for it:
  // the splash counts nothing, here or anywhere else under src/.
  await expect(splash.getByTestId("avatar-quota")).toHaveCount(0);
  await expect(splash).not.toContainText(/generations|left today|of \d/i);
  const ok = splash.getByTestId("avatar-ok");
  await expect(ok).toBeVisible();

  await ok.click();
  await expect(splash).toBeHidden();
  await expect(page.getByRole("img", { name: "Overworld" })).toBeVisible();
  expect((await page.request.get("/api/avatar/image")).status()).toBe(200);
  await page.unroute("**/api/avatar");

  await page.keyboard.press("Enter");
  const wearing = await readDialogue(page);
  await expect(wearing.getByRole("button")).toHaveCount(4);
  await expect(
    wearing.getByRole("button", { name: "Take it off" }),
  ).toBeVisible();

  await wearing.getByRole("button", { name: "Take it off" }).click();
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /back to your old self/i,
  );
  await expect
    .poll(async () => (await page.request.get("/api/avatar/image")).status())
    .toBe(404);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  const bare = await readDialogue(page);
  // Only [Take it off] goes: discarding clears what you WEAR, so the drawing is still
  // in the history and [Wear an old one] is still the way back to it.
  await expect(bare.getByRole("button")).toHaveCount(3);
  await expect(bare.getByRole("button", { name: "Take it off" })).toBeHidden();
  await expect(
    bare.getByRole("button", { name: "Wear an old one" }),
  ).toBeVisible();
});

test("the word sprite is nowhere a player can read it", async ({ page }) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("tester");

  const sprite = page.getByText(/sprite/i);
  await walkToArtist(page);
  await expect(sprite).toHaveCount(0);

  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);
  await expect(sprite).toHaveCount(0);

  await choices.getByRole("button", { name: "Draw me" }).click();
  await page.getByTestId("avatar-file").setInputFiles(SOURCE);
  await expect(page.getByTestId("dialogue-text")).toContainText(/offline/i);
  await expect(sprite).toHaveCount(0);
});
