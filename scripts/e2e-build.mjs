// Builds the app the local e2e shards serve. Playwright starts its servers before
// anything else it runs, so there is no hook inside the run that is early enough —
// and one build shared by every shard is the reason they start in seconds.
//
// A run against a DEPLOYED Worker (BASE_URL, which is CI) has nothing to build, and no
// `.env.e2e` either: that file is the local shards' secrets, and checking for it there
// would fail the pipeline over a file it is right not to have.
import { spawn } from "node:child_process";

if (process.env.BASE_URL !== undefined) process.exit(0);

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

await run("node", ["scripts/check-e2e-env.mjs"], {});
await run("node_modules/.bin/vite", ["build"], { CLOUDFLARE_ENV: "e2e" });
