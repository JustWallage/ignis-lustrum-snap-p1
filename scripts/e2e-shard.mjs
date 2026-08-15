// Serves ONE of the app instances `pnpm test:e2e` runs against. Playwright starts as
// many of these as it has workers, and a port plus a miniflare directory of its own is
// the whole of what makes two of them independent.
//
// It PREVIEWS the build rather than running a dev server, and that is the difference
// between four instances fitting on a laptop and not: a dev server compiles the app's
// modules on demand and re-serves ~200 of them on every `page.goto`, which on four
// cores is what the browsers need to keep the frame loop honest. The specs that walk a
// tile at a time read a position the game steps every 170ms, so a browser starved of a
// core walks two tiles on one press — the whole suite goes red before the CPU does.
//
// The port arrives as an argument rather than being derived here because the test side
// has to address these servers too: `appUrl` in `e2e/fixtures.ts` is where the numbers
// are chosen, and a second copy of that arithmetic is a shard talking to its neighbour.
//
// The migration runs here rather than once up front because every shard applies to a
// database of its own, so concurrent applies never meet.
import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";

const BUILT = "dist/ignis_snaps/index.js";

// Everything the Worker or the client is built out of. A stale `dist` is otherwise a
// green suite for code that is not the code on disk, which is worse than a red one.
const SOURCES = [
  "src",
  "worker",
  "shared",
  "public",
  "db",
  "index.html",
  "vite.config.ts",
  "wrangler.jsonc",
  ".env.e2e",
];

const port = Number.parseInt(process.argv[2] ?? "", 10);
if (!Number.isInteger(port)) {
  console.error("usage: node scripts/e2e-shard.mjs <port>");
  process.exit(1);
}

function newestUnder(path) {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (stat === undefined) return 0;
  if (!stat.isDirectory()) return stat.mtimeMs;
  return readdirSync(path).reduce(
    (newest, entry) => Math.max(newest, newestUnder(`${path}/${entry}`)),
    stat.mtimeMs,
  );
}

const built = statSync(BUILT, { throwIfNoEntry: false });
const newest = SOURCES.reduce(
  (newest, source) => Math.max(newest, newestUnder(source)),
  0,
);
if (built === undefined || built.mtimeMs < newest) {
  console.error(
    `\n  ${BUILT} is ${built === undefined ? "missing" : "older than the source it is built from"}.\n  Run \`pnpm test:e2e\`, which builds before it starts these servers.\n`,
  );
  process.exit(1);
}

const persistPath = `.wrangler/e2e-${port}`;

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

await run(
  "node_modules/.bin/wrangler",
  [
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    "dist/ignis_snaps/wrangler.json",
    "--persist-to",
    persistPath,
  ],
  {},
);
// `--strictPort`: vite otherwise walks to the next free port, which Playwright reads as
// a server that never came up while the shard it collided with answers for both.
await run(
  "node_modules/.bin/vite",
  ["preview", "--port", String(port), "--strictPort"],
  { E2E_PERSIST_PATH: persistPath },
);
