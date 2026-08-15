import { availableParallelism } from "node:os";
import { defineConfig, devices } from "@playwright/test";
import { appUrl } from "./e2e/fixtures";

// Local runs: Playwright starts one WHOLE APP per worker — its own D1, its own R2, its
// own `RealtimeDO` — on consecutive ports from 5174, because the suite's cost is the
// database it shares, not the browser. `scripts/e2e-shard.mjs` is what serves one.
// CI runs: BASE_URL points at the isolated deployment and no server starts.
//
// `workers` is what picks the shard, and nothing else may: `e2e/fixtures.ts` addresses
// the app at `parallelIndex`, so a worker without a server of its own silently shares
// its neighbour's database — a green run that tested nothing it claims to.
//
// One shard per core, MEASURED rather than chosen: a shard is a browser, a workerd and
// a node all wanting the same core, so the count that fits is a fact about the machine.
// On the four-core container this was tuned on, three, four and five shards all pass
// and four is quickest; six loses two tests and eight loses nine — always the specs
// that read a tile the game steps every 170ms, which a starved browser walks twice.
// `E2E_SHARDS` overrides it. The cap is memory: each shard holds ~700MB.
const shards =
  process.env.BASE_URL === undefined
    ? Number.parseInt(
        process.env.E2E_SHARDS ?? String(Math.min(availableParallelism(), 8)),
        10,
      )
    : 1;

// CI runs the suite as TWO jobs in parallel, each deploying its own isolated
// Worker and D1 and running ONE of these projects, so the pipeline waits for the
// slower half instead of the whole suite. Locally the split is not used at all —
// there every worker has a database of its own, so Playwright balances the files.
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

const chrome = { ...devices["Desktop Chrome"] };

const deployed = {
  workers: shards,
  projects: [
    { name: "event", testMatch: EVENT_SPECS, use: chrome },
    { name: "town", testIgnore: EVENT_SPECS, use: chrome },
  ],
};

const sharded = {
  workers: shards,
  // ONE retry, which serial local runs never needed and this one does. A shard per core
  // means a browser can lose its core for longer than the 170ms the game steps in, and
  // then `walk` presses once and the player moves two tiles. Nothing is hidden by it:
  // Playwright counts a test that needed the retry as FLAKY and prints it, so a spec
  // that has really gone bad still says so — it just no longer fails the whole run on
  // the machine's scheduling. Raise the shard count and this stops being enough.
  retries: 1,
  // TEST-level parallelism, not file-level: `podium.spec.ts` alone is longer than a
  // fifth of the suite, so leaving files whole leaves four workers idle waiting for it.
  // Safe only because no spec file has any shared setup — no `describe`, no
  // `beforeAll`, and a fixture that reseeds and resets per test. Adding one breaks this.
  fullyParallel: true,
  projects: [{ name: "local", use: chrome }],
  webServer: Array.from({ length: shards }, (_, worker) => ({
    command: `node scripts/e2e-shard.mjs ${5174 + worker}`,
    url: appUrl(worker),
    // NOT reused: a server already up is serving the build it loaded at start, and
    // `pnpm test:e2e` has just replaced that on disk. A stray one fails the run on
    // `--strictPort` instead, which is the report you want.
    reuseExistingServer: false,
    timeout: 120_000,
  })),
};

export default defineConfig({
  testDir: "./e2e",
  // One real page load per shard before anything is timed, so the first spec a worker
  // picks up is not charged for its app's cold start. See e2e/global-setup.ts.
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  retries: process.env.CI === undefined ? 0 : 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // A deterministic microphone and an auto-granted permission. Unconditional:
      // headless Chromium on a machine with no capture device REJECTS `getUserMedia`,
      // which is the refusal path, not the transmitting one these specs are about.
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
  ...(process.env.BASE_URL === undefined ? sharded : deployed),
});
