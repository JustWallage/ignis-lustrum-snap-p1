# Deploy, auth and seeding

Required before touching `wrangler.jsonc`, `.github/` or `iac/`.

- Push to `main` → `check-fast` (format, lint, types — the cheap gate in front of everything that
  costs Cloudflare), then in parallel `check-slow`, Terraform (prod D1 + the image bucket) and **two**
  ephemeral E2E jobs (`project: event` and `project: town`, each creating its own throwaway Worker +
  D1 and running `workers: 1`), then backfill images into R2, migrate, deploy, set secrets, seed prod
  D1. `branch-pipeline.yml` is the same graph minus Terraform and the deploy.
- Two concurrent throwaway databases is a ceiling, not a starting point: the account is near the free
  plan's D1 cap.
- **`deploy-prod` must `need` every one of those jobs and name every one in its
  `always() && ... == 'success'` condition.** `always()` is what lets it see a SKIPPED dependency, so a
  gate missing from either list stops guarding production without anything turning red.
- **Never pass `--env production`.** `CLOUDFLARE_ENV=production pnpm build` emits an already-flattened
  config, so every prod wrangler call passes only `-c "$CONFIG"`. With no matching env section wrangler
  falls back to legacy naming and acts on a phantom `ignis-snaps-production` worker — which is exactly
  how `JWT_SECRET` landed on the wrong worker and made every correct password 500.
- `snaps.justwallage.nl` is a Wrangler `routes` entry, not Terraform. **Two different R2 credentials,
  and the distinction survives the app moving into R2**: the Terraform STATE bucket is reached at
  `init` time through separate S3 credentials, while the app's own bucket is provisioned by the
  Cloudflare provider on the same API token that provisions D1.
- **The image backfill runs BEFORE `d1 migrations apply`** and nowhere else: migration `0014` drops the
  base64 columns it reads, and a D1 migration cannot write to R2. It is re-runnable and reports finding
  the columns already gone as its own outcome, so a no-op cannot pass for a copy.
- The ephemeral E2E bucket is NOT in Terraform: `ephemeral-e2e.yml` creates one shared bucket on demand,
  because Terraform only runs on `main` and a branch pipeline cannot wait on a production apply. Runs
  are isolated by `IMAGE_PREFIX`, and teardown signs in and calls `/api/test/reset` to sweep the prefix
  while the Worker that can still list it exists.
- **Two Gemini secrets, and NOTHING falls back between them**: `GEMINI_API_KEY` is the jury's,
  `GEMINI_API_KEY_PAID` is the one the image model bills per picture. Both are **deliberately optional
  everywhere** — without the jury's, every photograph scores 5 and nothing is described; without the
  paid one, the avatar
  machine answers "offline"; local and e2e run with neither. `bootstrap:gha` and `deploy.yml` SKIP
  each one when unset rather than pushing an empty secret, and both are declared optional in
  `worker/env.ts` because appearing in no `vars` block hides them from cf-typegen.
- **Deploy order says it out loud**: the code lands before the secret. Until `GEMINI_API_KEY_PAID` is
  set on the deployed worker, `POST /api/avatar` answers "the avatar machine is offline" and refunds
  the slot, while the jury keeps scoring on `GEMINI_API_KEY` — so a deploy without it is degraded, not
  broken, and setting the secret afterwards needs no second deploy. Splitting the key does NOT copy
  the old value across: an existing `GEMINI_API_KEY` keeps judging and avatars stay offline until the
  paid key is added to the repo secrets.
- **`cf-typegen` runs with `--env-file /dev/null`, and that flag is load-bearing**: wrangler loads a
  developer's `.env` into local bindings, so without it a machine holding `GEMINI_API_KEY` generates an
  `Env` where it is REQUIRED, and `pnpm check` then fails on every `apiKey === undefined` branch as an
  impossible condition. The types must describe the deployed worker, never the laptop.
- `AI` is a BINDING, not a secret: the binding IS the credential, nothing is set at deploy time.
  Whether the CI token may attach one cannot be verified before a prod deploy; if `wrangler deploy`
  refuses, add "Workers AI" to the token, and until then removing the `ai` key deploys a working app
  with the neighbour asleep.
- `scripts/seed.mjs` hashes with the SAME PBKDF2 parameters as `worker/lib/auth.ts`, so offline-seeded
  rows verify at runtime. **Change one and you must change the other.**
- The cookie is written in exactly one place (`worker/lib/session.ts`) and its `maxAge` is the same
  constant as the JWT's `exp`, so the browser never keeps a cookie the worker would reject.
- **The roster is `USERS_JSON` and nothing else. This repo is PUBLIC**, so no `users.json` is committed
  and none can be: `.gitignore` holds both it and `users.md`. `bootstrap:gha` REFUSES without
  `USERS_JSON` in `.env` rather than falling back to a file, and the deploy hashes that secret into prod
  D1 on every push. Adding a friend is one edit to `.env` and one `pnpm bootstrap:gha`. Locally you may
  keep the same array in a gitignored `users.json`; a clone with neither seeds the four throwaway users
  in `users.example.json`, which are also what `wrangler.jsonc` gives the local worker.
- No server-side revocation; rotating `JWT_SECRET` is the only way to invalidate everything.
  `worker/routes/auth.test.ts` pins that, so if it starts failing somebody added revocation and this
  doc is stale.
