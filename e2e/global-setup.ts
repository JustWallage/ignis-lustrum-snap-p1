import { chromium, expect, type FullConfig } from "@playwright/test";

/**
 * Drives ONE real page load before any test runs.
 *
 * Whichever spec sorts first in a run otherwise pays the whole cold start: a
 * Worker deployed seconds ago, a `RealtimeDO` that has never been instantiated
 * and a D1 that has never been queried. `fixtures.ts` polls the seed and the
 * reset, and the e2e workflow polls the API until it answers, but nothing warms
 * the CLIENT path — so the first file kept flaking whatever it was. Splitting
 * the suite into two projects made that visible by creating a second first file,
 * and moving files between projects only ever moved the flake: `countdown` first
 * in `event` flaked four runs out of four, and `live-event` flaked the moment it
 * inherited the seat.
 *
 * So this is deliberately not a health check. It fetches the bundle, boots the
 * app and waits for the title screen the way a player would, because that is the
 * work the first spec should not be charged for.
 */
export default async function warmUp(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (baseURL === undefined) return;
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const browser = await chromium.launch(
    executablePath === undefined ? {} : { executablePath },
  );
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto("/");
    // Generous: this is the one place in the suite where a cold start is
    // expected rather than a failure.
    await expect(page.getByTestId("start-button")).toBeVisible({
      timeout: 60_000,
    });
  } finally {
    await browser.close();
  }
}
