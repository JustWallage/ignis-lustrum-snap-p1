import type { Locator } from "@playwright/test";
import {
  apiSignIn,
  apiUpload,
  expect,
  openArchive,
  openBallot,
  pressStart,
  setDay,
  test,
  walkToShelf,
  walkToVotingNpc,
} from "./fixtures";

/** Nothing here performs the gesture: both projects are Desktop Chrome, which has no
 * touch input pipeline, so there is no double-tap zoom to trigger and `visualViewport`
 * would read 1 whatever the CSS says. The resolved value is what is left to assert, and
 * it is enough to catch the rule not reaching an element — `touch-action` does not
 * inherit, which is the whole risk in anchoring one high up. */
async function touchAction(target: Locator): Promise<string> {
  return target.first().evaluate((element) => {
    return getComputedStyle(element).touchAction;
  });
}

/** Their `none` is load-bearing, not an oversight to widen away: a thumb dragging the
 * D-pad or holding the shoulder bar must not pan the page, and panning fires the
 * `pointercancel` that kills a transmission. */
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

  // The one surface an anchor high up can silently miss, since a `<dialog>` paints in the
  // top layer and only its DOM position brings the stage's rule with it.
  await walkToVotingNpc(page);
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".gb-window").getByRole("heading", { name: "Sign in" }),
  ).toBeVisible();
  expect(await touchAction(page.locator(".modal-layer"))).toBe("manipulation");
  expect(await touchAction(page.locator(".gb-window"))).toBe("manipulation");

  // Pinch itself is unreachable on a mouse-only browser, so this pins the meta instead:
  // `user-scalable=no` or a `maximum-scale` here would take it away.
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    "width=device-width, initial-scale=1.0",
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
