import type { Page, Route } from "@playwright/test";
import {
  apiSignIn,
  expect,
  handSnapToJury,
  pressStart,
  test,
  TINY_PNG,
  walkToShelf,
} from "./fixtures";

// `initPwa` registers a worker that `clients.claim()`s this page, and Playwright does
// not route service-worker-initiated requests — so the `hold` intercepts below would
// race the worker for the held request. Block it: nothing here tests PWA.
test.use({ serviceWorkers: "block" });

interface Held {
  release: () => void;
  count: () => number;
}

/** Holds every matching request until released; everything else on that URL goes
 * straight through, so a held POST does not also stall the GET after it. */
async function hold(
  page: Page,
  pattern: string,
  method: string,
): Promise<Held> {
  let open = () => {
    // Replaced below, before any route can reach it.
  };
  const gate = new Promise<void>((resolve) => {
    open = () => {
      resolve();
    };
  });
  let count = 0;
  await page.route(pattern, async (route: Route) => {
    if (route.request().method() !== method) {
      await route.continue();
      return;
    }
    count += 1;
    await gate;
    await route.continue();
  });
  return {
    release: () => {
      open();
    },
    count: () => count,
  };
}

const SNAP = { name: "snap.png", mimeType: "image/png", buffer: TINY_PNG };

async function openOwnSnap(page: Page) {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await handSnapToJury(page, SNAP);
  const dialog = page.locator(".gb-window");
  await expect(dialog.getByTestId("comment-thread")).toBeVisible();
  return dialog;
}

test("a slow comment says it is sending, and stops once it has", async ({
  page,
}) => {
  const dialog = await openOwnSnap(page);

  const post = await hold(page, "**/api/photos/*/comments", "POST");
  const send = dialog.getByRole("button", { name: "Send" });
  await dialog.getByPlaceholder("Add a comment…").fill("nice one");
  await send.click();

  await expect(send).toHaveAttribute("aria-busy", "true");
  await expect(send).toBeDisabled();
  await expect(send.getByTestId("pending")).toBeVisible();

  post.release();
  await expect(dialog.getByTestId("comment-thread")).toContainText("nice one");
  await expect(send).toHaveAttribute("aria-busy", "false");
});

test("two taps of Send post one comment", async ({ page }) => {
  const dialog = await openOwnSnap(page);

  const post = await hold(page, "**/api/photos/*/comments", "POST");
  const field = dialog.getByPlaceholder("Add a comment…");
  const send = dialog.getByRole("button", { name: "Send" });
  await field.fill("only once");
  await field.press("Enter");
  await expect(send).toBeDisabled();
  // Both ways in, while the first is still in flight: the button, which the
  // browser now refuses to fire at all, and Enter in the field, which submits
  // the form regardless of what the button is doing.
  await send.click({ force: true });
  await field.press("Enter");

  post.release();
  await expect(dialog.getByTestId("comment-thread")).toContainText("only once");
  expect(post.count()).toBe(1);
  await expect(
    dialog.getByTestId("comment-thread").getByRole("listitem"),
  ).toHaveCount(1);
});

test("a like waits for the count, not just for the POST", async ({ page }) => {
  const dialog = await openOwnSnap(page);
  const like = dialog.getByRole("button", { name: /♡|♥/ });
  await expect(like).toContainText("0");

  const refetch = await hold(page, "**/api/photos/*", "GET");
  await like.click();
  await expect(like).toHaveAttribute("aria-busy", "true");
  await expect(like).toContainText("0");

  refetch.release();
  await expect(like).toContainText("1");
  await expect(like).toHaveAttribute("aria-busy", "false");
});

test("the archive says it is loading rather than showing an empty shelf", async ({
  page,
}) => {
  await apiSignIn(page);
  const days = await hold(page, "**/api/days", "GET");
  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  await page.keyboard.press("Enter");

  const line = page.getByTestId("archive").getByTestId("archive-empty");
  await expect(line.getByTestId("pending")).toBeVisible();
  await expect(line).not.toContainText("Nothing is in the archive");

  days.release();
  await expect(line).toContainText("Nothing is in the archive");
  await expect(line.getByTestId("pending")).toBeHidden();
});
