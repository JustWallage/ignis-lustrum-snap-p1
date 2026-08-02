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
// The split is by MEASURED time, not by file count — the live event's phases wait
// on the DO's alarms, so these four carry about half the clock. `podium.spec.ts` is
// the heaviest single file and sets the floor: splitting IT is the only way past it.
//
// No measured times are recorded here ON PURPOSE. Every ticket that added a spec
// restated them and every restatement was stale on landing, which made this block a
// conflict on four branches at once. Read them off the list reporter in the e2e job's
// log if you ever re-balance; nothing here is maintained per-ticket.
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
    launchOptions: {
      // A deterministic microphone and an auto-granted permission, so the push-to-talk
      // specs neither wait on a permission dialog nor depend on a machine having a
      // capture device. Unconditional: without them `getUserMedia` hangs in CI.
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
      // Sandboxes with a system-provided Chromium (e.g. Claude Code on the web)
      // can point at it instead of downloading a browser.
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH === undefined
        ? {}
        : { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }),
    },
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
