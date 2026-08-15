// Wrangler layers `.env.e2e` OVER `.env`, so a developer's own `.env` reaches the e2e
// Worker through every key `.env.e2e` does not set. Two of them are not survivable and
// neither says so at the time: the real USERS_JSON seeds the real roster and every
// login 401s, and a live GEMINI_API_KEY_PAID makes the specs that assert an offline
// avatar machine buy pictures on the billed key instead of failing.
import { existsSync, readFileSync } from "node:fs";

const E2E_FILE = ".env.e2e";

const TAKE_THE_EXAMPLE =
  "copy USERS_JSON out of .env.e2e.example into .env.e2e";

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const at = line.indexOf("=");
    if (at <= 0 || line.trimStart().startsWith("#")) continue;
    // Quotes are the developer's, not the value's: `.env` may wrap USERS_JSON in
    // them and wrangler strips them before the Worker ever sees it.
    values[line.slice(0, at).trim()] = line
      .slice(at + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/s, "$2");
  }
  return values;
}

function refuse(problem, fix) {
  console.error(`\n  ${E2E_FILE} is wrong for e2e: ${problem}\n  ${fix}\n`);
  process.exit(1);
}

if (!existsSync(E2E_FILE)) {
  refuse("it does not exist", `cp .env.e2e.example ${E2E_FILE}`);
}

const env = { ...readEnvFile(".env"), ...readEnvFile(E2E_FILE) };

for (const key of ["GEMINI_API_KEY", "GEMINI_API_KEY_PAID"]) {
  if ((env[key] ?? "") !== "") {
    refuse(
      `${key} is set, so the specs asserting an offline machine will spend real money`,
      `add \`${key}=\` to ${E2E_FILE}`,
    );
  }
}

// COUNTED, never printed, and never parsed outside this try: USERS_JSON is a
// credential blob, and a stack trace echoing it puts the friends group's passwords on
// a terminal — which is exactly what the first version of this file did.
const expected = JSON.parse(readFileSync("users.example.json", "utf8")).map(
  (one) => one.name,
);
let seeded = [];
try {
  seeded = JSON.parse(env.USERS_JSON ?? "[]").map((one) => one.name);
} catch {
  refuse("USERS_JSON is not readable as JSON", TAKE_THE_EXAMPLE);
}
if ([...seeded].sort().join() !== [...expected].sort().join()) {
  refuse(
    `USERS_JSON seeds ${String(seeded.length)} accounts, and the suite signs in as ${String(expected.length)} test accounts`,
    TAKE_THE_EXAMPLE,
  );
}
