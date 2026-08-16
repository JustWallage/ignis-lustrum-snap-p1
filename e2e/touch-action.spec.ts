import type { Locator } from "@playwright/test";
import {
  apiSignIn,
  apiUpload,
  expect,
  openArchive,
  openBallot,
  openConsole,
  pressStart,
  setDay,
  test,
  walkToShelf,
  walkToVotingNpc,
} from "./fixtures";

/** Nothing here performs the gesture: both projects are Desktop Chrome, which has no
 * touch input pipeline, so there is no double-tap zoom to trigger and `visualViewport`
 * would read 1 whatever the CSS says. The resolved value is what is left to assert. */
async function touchAction(target: Locator): Promise<string> {
  return target.first().evaluate((element) => {
    return getComputedStyle(element).touchAction;
  });
}

const HARDWARE = [
  ".gb-dpad-key",
  ".gb-ab-btn button",
  ".gb-pill-cap",
  ".gb-ptt",
];

test("the shell suppresses double-tap zoom without touching the hardware or pinch", async ({
  page,
}) => {
  await page.goto("/");
  await pressStart(page);

  expect(await touchAction(page.locator(".gb-stage"))).toBe("manipulation");
  expect(await touchAction(page.locator(".gb-lcd"))).toBe("manipulation");

  for (const cluster of HARDWARE) {
    expect(await touchAction(page.locator(cluster))).toBe("none");
  }

  await walkToVotingNpc(page);
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".gb-window").getByRole("heading", { name: "Sign in" }),
  ).toBeVisible();
  expect(await touchAction(page.locator(".modal-layer"))).toBe("manipulation");
  expect(await touchAction(page.locator(".gb-window"))).toBe("manipulation");

  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    "width=device-width, initial-scale=1.0, maximum-scale=1",
  );
});

test("the operator's console suppresses it too, outside the stage as it is", async ({
  page,
}) => {
  await apiSignIn(page);
  const panel = await openConsole(page, "Clock");

  expect(await touchAction(page.locator(".ops-screen"))).toBe("manipulation");
  expect(await touchAction(panel.getByTestId("ops-day-input"))).toBe(
    "manipulation",
  );
  expect(await touchAction(panel.getByTestId("ops-day-set"))).toBe(
    "manipulation",
  );
});

test("the archive's feed and rails and the viewer's tap zones stay permissive", async ({
  page,
}) => {
  await apiUpload(page, "tester");
  await apiUpload(page, "rival");
  await setDay(page, 2);
  await apiSignIn(page, "tester");

  await page.goto("/");
  await pressStart(page);
  await walkToShelf(page);
  const archive = await openArchive(page);

  expect(await touchAction(page.getByTestId("archive-results"))).toBe(
    "manipulation",
  );
  expect(
    await touchAction(
      page.getByTestId("archive-days").locator(".arc-rail-scroll"),
    ),
  ).toBe("manipulation");
  expect(await touchAction(archive.getByTestId("archive-card"))).toBe(
    "manipulation",
  );

  await page.getByTestId("archive-photo").first().click();
  await expect(page.getByTestId("viewer-photo")).toBeVisible();

  for (const side of ["back", "on"]) {
    expect(await touchAction(page.getByTestId(`viewer-tap-${side}`))).toBe(
      "manipulation",
    );
  }
  expect(await touchAction(page.getByTestId("viewer-comments"))).toBe(
    "manipulation",
  );
});

test("the ballot's grid stays permissive", async ({ page }) => {
  await apiUpload(page, "rival");
  await apiUpload(page, "voter");
  await apiSignIn(page, "tester");

  await page.goto("/");
  await pressStart(page);
  await walkToVotingNpc(page);
  await openBallot(page);

  expect(await touchAction(page.getByTestId("vote-candidates"))).toBe(
    "manipulation",
  );
});
