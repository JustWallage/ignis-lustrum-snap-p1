import { SPAWN } from "../shared/map";
import {
  apiSignIn,
  expect,
  pressStart,
  readDialogue,
  test,
  walkToNeighbour,
} from "./fixtures";

const TYPE_MY_OWN = "Say something else";

const ROWS = 5;

test("an anonymous walker is asked to sign in", async ({ page }) => {
  await page.goto("/");
  await pressStart(page);

  await walkToNeighbour(page);
  await expect(page.getByText(/sign in to talk to chris/i)).toBeVisible();
  await page.keyboard.press("Enter");

  const dialog = page.locator(".gb-window");
  await expect(dialog.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(dialog.getByText(/signed-in friends only/i)).toBeVisible();
});

test("the whole conversation can be had with the D-pad", async ({ page }) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("tester");

  await walkToNeighbour(page);
  await expect(page.getByText(/talk to chris/i)).toBeVisible();
  await page.keyboard.press("Enter");

  const text = page.getByTestId("dialogue-text");
  await expect(text).toContainText(/CHRIS:/);
  const opening = await readDialogue(page);
  const picks = opening.getByRole("button");
  await expect(picks).toHaveCount(ROWS);
  await expect(picks.last()).toHaveText(/Goodbye/);
  await expect(picks.nth(3)).toHaveText(new RegExp(TYPE_MY_OWN));
  for (const label of await picks.allTextContents()) {
    expect(label.replace(/[▶\s]/g, "")).not.toBe("");
  }

  await picks.first().click();
  await expect(text).toContainText(/did not catch a word/i);
  const again = await readDialogue(page);
  await expect(again.getByRole("button")).toHaveCount(ROWS);

  await again.getByRole("button").first().click();
  const third = await readDialogue(page);
  await expect(third.getByRole("button")).toHaveCount(ROWS);

  await third.getByRole("button", { name: /Goodbye/ }).click();
  await expect(page.getByTestId("dialogue-choices")).toBeHidden();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("player-pos")).toHaveAttribute(
    "data-y",
    String(SPAWN.y + 1),
  );
});

test("typing your own answer is still there, one entry down", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  await walkToNeighbour(page);
  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);

  await choices.getByRole("button", { name: new RegExp(TYPE_MY_OWN) }).click();
  const field = page.getByTestId("say-input");
  await expect(field).toBeVisible();
  await field.fill("who took the good one yesterday?");
  await page.getByTestId("say-send").click();

  await expect(page.getByTestId("dialogue-text")).toContainText(
    /did not catch a word/i,
  );
  const after = await readDialogue(page);
  await expect(after.getByRole("button")).toHaveCount(ROWS);
  await expect(
    after.getByRole("button", { name: new RegExp(TYPE_MY_OWN) }),
  ).toBeVisible();
});

test("backing out of the field returns to his choices, not to the map", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  await walkToNeighbour(page);
  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);

  // Driven with the D-pad rather than a click, because the CURSOR is under test: a
  // mouse leaves itself hovering, and `onPointerEnter` moves the cursor with the hover.
  for (let down = 0; down < 3; down += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(choices.getByRole("button").nth(3)).toHaveAttribute(
    "data-selected",
    "true",
  );
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("say-input")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("say-input")).toBeHidden();
  await expect(page.getByTestId("dialogue-text")).toContainText(/CHRIS:/);
  const back = await readDialogue(page);
  await expect(back.getByRole("button")).toHaveCount(ROWS);
  await expect(back.getByRole("button").first()).toHaveAttribute(
    "data-selected",
    "true",
  );
});

test("the name Bram appears nowhere a player can read it", async ({ page }) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  const bram = page.getByText(/bram/i);
  await walkToNeighbour(page);
  await expect(bram).toHaveCount(0);
  await expect(page.getByText(/talk to chris/i)).toBeVisible();

  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);
  await expect(bram).toHaveCount(0);

  await choices.getByRole("button").first().click();
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /did not catch a word/i,
  );
  await readDialogue(page);
  await expect(bram).toHaveCount(0);
});

test("walking away is the whole of his memory", async ({ page }) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  await walkToNeighbour(page);
  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);
  await choices.getByRole("button", { name: new RegExp(TYPE_MY_OWN) }).click();
  await page.getByTestId("say-input").fill("remember this");
  await page.getByTestId("say-send").click();
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /did not catch a word/i,
  );

  await (
    await readDialogue(page)
  )
    .getByRole("button", { name: /Goodbye/ })
    .click();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dialogue-text")).toContainText(
    /there you are/i,
  );
});
