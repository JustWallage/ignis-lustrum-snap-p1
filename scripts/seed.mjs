// Hashes passwords exactly like worker/lib/auth.ts (PBKDF2-SHA256, 100k iterations):
// change one and you must change the other. Offline hashing; wrangler applies the SQL.
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const PBKDF2_ITERATIONS = 100000;
const args = process.argv.slice(2);
const remote = args.includes("--remote");
const configIndex = args.indexOf("--config");
const configPath = configIndex >= 0 ? args[configIndex + 1] : undefined;

function bytesToHex(bytes) {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return {
    hash: bytesToHex(new Uint8Array(derivedBits)),
    salt: bytesToHex(salt),
  };
}

// This repo is public and `users.json` is gitignored, so a fresh clone has no
// roster at all — falling through to the throwaway example is what keeps
// `pnpm dev` (which seeds on every start) from dying on a missing file. Those
// four names are the same ones wrangler.jsonc hands the local worker, so the
// rows this writes are the accounts you can actually log in as.
const raw =
  process.env.USERS_JSON ??
  (await readFile("users.json", "utf8").catch(() =>
    readFile("users.example.json", "utf8"),
  ));
const users = JSON.parse(raw);
const now = Math.floor(Date.now() / 1000);
const statements = [];
for (const user of users) {
  if (!user.name || !user.password) continue;
  const { hash, salt } = await hashPassword(user.password);
  statements.push(
    `INSERT INTO users (name, password_hash, salt, created_at) VALUES ('${user.name}', '${hash}', '${salt}', ${now}) ` +
      `ON CONFLICT(name) DO UPDATE SET password_hash = excluded.password_hash, salt = excluded.salt;`,
  );
}

await writeFile(".seed.sql", statements.join("\n"));

// --remote runs against the config CI prepared, which is production ALREADY FLATTENED
// into the top level. Passing `--env production` on top makes wrangler resolve a legacy
// "ignis-snaps-production" worker that does not exist, so it is deliberately absent.
if (remote && configPath === undefined) {
  throw new Error("--remote requires --config <prepared wrangler config>");
}
const wranglerArgs = ["exec", "wrangler", "d1", "execute", "DB"];
wranglerArgs.push(remote ? "--remote" : "--local", "--file=.seed.sql");
if (remote) wranglerArgs.push("-y");
if (configPath !== undefined) wranglerArgs.push("-c", configPath);

const result = spawnSync("pnpm", wranglerArgs, { stdio: "inherit" });
process.exit(result.status ?? 1);
