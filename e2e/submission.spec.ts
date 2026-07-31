import type { Page } from "@playwright/test";
import { mySubmissionSchema, photoSchema } from "../shared/api";
import { gameStateSchema } from "../shared/state";
import {
  apiSignIn,
  expect,
  handSnapToJury,
  pressStart,
  readDialogue,
  test,
  TINY_PNG,
  TODAY,
  walkToJury,
} from "./fixtures";

async function mySnapId(page: Page): Promise<number | null> {
  const res = await page.request.get("/api/photos/mine");
  return mySubmissionSchema.parse(await res.json()).photo?.id ?? null;
}

test("talking to the jury requires sign-in, then shares a snap in one tap", async ({
  page,
}) => {
  await page.goto("/");
  await pressStart(page);

  await walkToJury(page);
  await expect(page.getByText(/sign in to meet the jury/i)).toBeVisible();
  await page.keyboard.press("Enter");

  const dialog = page.locator(".gb-window");
  await expect(dialog.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await dialog.getByLabel("Name").fill("tester");
  await dialog.getByLabel("Password").fill("test-password-123");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("player-name")).toHaveText("tester");

  await expect(
    page.getByText(new RegExp(`talk to ${TODAY.name}`, "i")),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toContainText(
    TODAY.name.toUpperCase(),
  );
  const choices = await readDialogue(page);
  await choices.getByRole("button", { name: "Upload photo" }).click();

  await expect(dialog).toBeHidden();
  await page.getByTestId("snap-file").setInputFiles({
    name: "snap.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });

  await expect(
    dialog.getByRole("heading", { name: "Snap", exact: true }),
  ).toBeVisible();

  await dialog.getByRole("button", { name: "♡ 0" }).click();
  await expect(dialog.getByRole("button", { name: "♥ 1" })).toBeVisible();
  await dialog.getByRole("button", { name: "♥ 1" }).click();
  await expect(dialog.getByRole("button", { name: "♡ 0" })).toBeVisible();

  await dialog.getByPlaceholder("Add a comment…").fill("great shot");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText("great shot")).toBeVisible();
});

test("dismissing the picker sends nothing at all", async ({ page }) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await walkToJury(page);
  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);
  await choices.getByRole("button", { name: "Upload photo" }).click();

  // A cancelled picker fires no `change` at all, so nothing may be invented for it. A
  // zero-file `change` is as close as Playwright gets to backing out.
  await page.getByTestId("snap-file").setInputFiles([]);
  await expect(
    choices.getByRole("button", { name: "Upload photo" }),
  ).toBeVisible();
  await expect(page.getByTestId("dialogue-text")).not.toContainText(
    /would not go through|could not make sense/i,
  );
  await expect(page.locator(".gb-window")).toBeHidden();
  const state = await page.request.get("/api/state");
  expect(gameStateSchema.parse(await state.json()).submissionCount).toBe(0);
});

test("the jury takes one snap a day, and asks before it swaps one", async ({
  page,
}) => {
  await apiSignIn(page);
  const first = await page.request.post("/api/photos", {
    multipart: {
      photo: { name: "snap.png", mimeType: "image/png", buffer: TINY_PNG },
    },
  });
  expect(first.status()).toBe(201);
  const firstId = photoSchema.parse(await first.json()).id;

  // Wait for the answer the jury branches on rather than racing it: without it
  // the second visit is indistinguishable from the first.
  const mine = page.waitForResponse(
    (res) => res.url().includes("/api/photos/mine") && res.ok(),
  );
  await page.goto("/");
  await pressStart(page);
  await mine;

  await walkToJury(page);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toContainText(/already in/i);
  const offered = await readDialogue(page);
  await expect(
    offered.getByRole("button", { name: "Upload photo" }),
  ).toBeHidden();

  await offered.getByRole("button", { name: "Replace photo" }).click();
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /gone for good/i,
  );
  const asked = page.getByTestId("dialogue-choices");
  await expect(asked.getByRole("button", { name: "Cancel" })).toHaveAttribute(
    "data-selected",
    "true",
  );
  await asked.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByTestId("dialogue-text")).toBeHidden();
  expect(await mySnapId(page)).toBe(firstId);

  await page.keyboard.press("Enter");
  const again = await readDialogue(page);
  await again.getByRole("button", { name: "Replace photo" }).click();
  await page
    .getByTestId("dialogue-choices")
    .getByRole("button", { name: "Replace it" })
    .click();
  await page.getByTestId("snap-file").setInputFiles({
    name: "snap.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await expect(
    page
      .locator(".gb-window")
      .getByRole("heading", { name: "Snap", exact: true }),
  ).toBeVisible();

  expect(await mySnapId(page)).not.toBe(firstId);
  const state = await page.request.get("/api/state");
  expect(gameStateSchema.parse(await state.json()).submissionCount).toBe(1);
});

test("the jury reads the route's own refusal out of the text box", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await walkToJury(page);
  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);
  await choices.getByRole("button", { name: "Upload photo" }).click();

  const other = await page.request.post("/api/photos", {
    multipart: {
      photo: { name: "snap.png", mimeType: "image/png", buffer: TINY_PNG },
    },
  });
  expect(other.status()).toBe(201);

  await page.getByTestId("snap-file").setInputFiles({
    name: "snap.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /already submitted today/i,
    { timeout: 15_000 },
  );

  const state = await page.request.get("/api/state");
  expect(gameStateSchema.parse(await state.json()).submissionCount).toBe(1);
});

test("a file that is not a photo never leaves the browser", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  await handSnapToJury(page, {
    name: "notes.png",
    mimeType: "image/png",
    buffer: Buffer.from("this is not a PNG at all"),
  });
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /could not make sense of that file/i,
    { timeout: 15_000 },
  );

  const state = await page.request.get("/api/state");
  expect(gameStateSchema.parse(await state.json()).submissionCount).toBe(0);
});

test("a snap too big for D1 is refused by the route, not written", async ({
  page,
}) => {
  await apiSignIn(page);

  const oversized = Buffer.alloc(1_300_000, 7);
  const res = await page.request.post("/api/photos", {
    multipart: {
      photo: { name: "huge.png", mimeType: "image/png", buffer: oversized },
    },
  });
  expect(res.status()).toBe(400);
  expect(await res.text()).toContain("1.2 MB");

  const state = await page.request.get("/api/state");
  expect(gameStateSchema.parse(await state.json()).submissionCount).toBe(0);
});
