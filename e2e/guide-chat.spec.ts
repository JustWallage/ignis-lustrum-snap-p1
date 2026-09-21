import { GUIDE, NEIGHBOUR } from "../shared/map";
import {
  apiSignIn,
  expect,
  pressStart,
  readDialogue,
  test,
  walk,
  walkToGuide,
  walkToNeighbour,
} from "./fixtures";

/** No `AI` binding in any test environment, so every one of his answers is the canned
 * Dutch one — which is what makes "he answers in Dutch" assertable at all. */
const NO_SIGNAL = /geen bereik/i;

const ASK_MY_OWN = "Vraag iets anders";

const TODAY = "Wat doen we vandaag?";

test("an anonymous walker is asked to sign in before the guide talks", async ({
  page,
}) => {
  await page.goto("/");
  await pressStart(page);

  await walkToGuide(page);
  await expect(page.getByText(/sign in to ask nico/i)).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(
    page.locator(".gb-window").getByRole("heading", { name: "Sign in" }),
  ).toBeVisible();
});

test("he opens in Dutch with today's plan on the first row", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  await walkToGuide(page);
  await expect(page.getByText(/ask nico about the trip/i)).toBeVisible();
  await page.keyboard.press("Enter");

  const text = page.getByTestId("dialogue-text");
  await expect(text).toContainText(/NICO:/);
  await expect(text).toContainText(/reisleider/i);
  const opening = await readDialogue(page);
  await expect(opening.getByRole("button")).toHaveCount(5);
  await expect(opening.getByRole("button").first()).toContainText(TODAY);
  await expect(opening.getByRole("button").nth(3)).toContainText(ASK_MY_OWN);
  await expect(opening.getByRole("button").last()).toContainText("Tot ziens");

  await opening.getByRole("button", { name: TODAY }).click();
  await expect(text).toContainText(NO_SIGNAL);
});

test("asking something else of his own goes through the same field", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  await walkToGuide(page);
  await page.keyboard.press("Enter");
  const choices = await readDialogue(page);

  await choices.getByRole("button", { name: ASK_MY_OWN }).click();
  const field = page.getByTestId("say-input");
  await expect(field).toBeVisible();
  await field.fill("hoe laat vertrekken we morgen?");
  await page.getByTestId("say-send").click();

  await expect(page.getByTestId("dialogue-text")).toContainText(NO_SIGNAL);
  const after = await readDialogue(page);
  await expect(after.getByRole("button", { name: ASK_MY_OWN })).toBeVisible();
});

test("the neighbour's conversation is not the guide's", async ({ page }) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);

  await walkToNeighbour(page);
  await page.keyboard.press("Enter");
  const chris = await readDialogue(page);
  await chris.getByRole("button", { name: /Goodbye/ }).click();

  // One tile to the left, and a different person entirely: his own opening rather
  // than whatever the neighbour last said, and no English row left on the box.
  await walk(page, "ArrowLeft", GUIDE.x, NEIGHBOUR.y - 1);
  await walk(page, "ArrowDown", GUIDE.x, NEIGHBOUR.y - 1);
  await expect(page.getByText(/ask nico about the trip/i)).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("dialogue-text")).toContainText(/NICO:/);
  const nico = await readDialogue(page);
  await expect(
    nico.getByRole("button", { name: /Say something else/ }),
  ).toHaveCount(0);
  await expect(nico.getByRole("button", { name: /Goodbye/ })).toHaveCount(0);
});
