import { defineConfig, devices } from "@playwright/test";

// Local runs: Playwright starts its own e2e-mode dev server on port 5174
// (separate from `pnpm dev` on 5173) and reuses it across runs.
// CI runs: BASE_URL points at the isolated deployment and no server starts.
const baseURL = process.env.BASE_URL ?? "http://localhost:5174";

// CI runs the suite as TWO jobs in parallel, each deploying its own isolated
// Worker and D1 and running ONE of these projects, so the pipeline waits for the
// slower half instead of the whole suite. Locally `pnpm test:e2e` runs both, in
// order, exactly as before.
//
// The split is by MEASURED time, not by file count — the live event's phases
// wait on the DO's alarms, so five files carry more than half the clock:
//
//   event  podium 252s · live-loop 116s · wheel 69s · live-event 5s     = 442s
//   town   the other files                                              = 493s
//
// (`town` has since gained `town-avatars.spec.ts`, which that 493s predates.)
//
// (CI run 30494209666, retry time subtracted; the whole suite is 934s.) Those two
// numbers are that run's, and town has gained `jury-bench.spec.ts` and
// `delete-snap.spec.ts` since, plus three tests in `archive`/`voting` — 28 files and
// about 25s more, measured locally, so it is still the heavier half. The
// bound is 467s. Re-measure and re-balance when it drifts — the per-test times
// are printed by the list reporter in each e2e job's log. `podium.spec.ts` alone
// is 27% of the suite, so it sets the floor: no split of these files gets below
// ~470s, and splitting podium itself is the only way past that. Two tickets have
// now added to `town` without re-measuring it: take these numbers from the next CI
// log rather than trusting them for the split after this one.
//
// `countdown.spec.ts` is in `town` DESPITE being the event's opening phase, and
// it is not an oversight. Whichever file sorts first in a project pays the cold
// start of a Worker deployed seconds earlier, and countdown's tests pin two
// browser clocks to one absolute second — they have the least slack of anything
// in the suite. First in `event` it flaked in four runs out of four; sixth in
// `town`, where it sat for the whole serial suite, it never has. The warm-up in
// the workflow gets the API answering, but nothing pre-warms a first page load.
// Move it back only together with a fix that makes those specs tolerate one.
//
// `town` is defined by EXCLUSION so a new spec file joins it automatically. Do
// not turn that into a second explicit list: a file in neither project is a file
// nothing runs, and the pipeline stays green while it does so.
const EVENT_SPECS = [
  "live-event.spec.ts",
  "live-loop.spec.ts",
  "podium.spec.ts",
  "wheel.spec.ts",
].map((spec) => `**/${spec}`);

export default defineConfig({
  testDir: "./e2e",
  // One real page load before anything is timed, so the first spec in a project
  // is not charged for the app's cold start. See e2e/global-setup.ts.
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  retries: process.env.CI === undefined ? 0 : 2,
  // Single worker: tests share one database and reset it between tests. Each CI
  // job has a deployment and a database of its own, so this holds there too —
  // the two projects never meet.
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Sandboxes with a system-provided Chromium (e.g. Claude Code on the web)
    // can point at it instead of downloading a browser.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH === undefined
      ? {}
      : {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
          },
        }),
  },
  projects: [
    {
      name: "event",
      testMatch: EVENT_SPECS,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "town",
      testIgnore: EVENT_SPECS,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(process.env.BASE_URL === undefined
    ? {
        webServer: {
          command: "pnpm dev:e2e",
          url: "http://localhost:5174",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
});
