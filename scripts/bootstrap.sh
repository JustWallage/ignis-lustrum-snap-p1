#!/usr/bin/env bash
# One-time, idempotent bootstrap for LOCAL development. Installs dependencies,
# writes .dev.vars, applies local D1 migrations, and seeds the friends group.
# It never touches Cloudflare — provisioning and production deploys happen only
# in the GitHub Actions pipeline. Run `pnpm bootstrap:gha` to configure that
# pipeline's secrets from the same .env.
set -euo pipefail

cd "$(dirname "$0")/.."

say() { printf '\033[1;32m[bootstrap]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[bootstrap]\033[0m %s\n' "$*" >&2; exit 1; }

command -v pnpm >/dev/null || die "pnpm is required"

# .env is optional for pure local dev (wrangler.jsonc ships a local JWT_SECRET),
# but if present we lift JWT_SECRET into .dev.vars.
JWT_SECRET_VALUE="local-dev-secret-not-for-production"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  [ -n "${JWT_SECRET:-}" ] && JWT_SECRET_VALUE="$JWT_SECRET"
fi

say "Installing dependencies"
pnpm install

if [ ! -f .dev.vars ]; then
  say "Creating .dev.vars"
  printf 'JWT_SECRET=%s\n' "$JWT_SECRET_VALUE" >.dev.vars
else
  say ".dev.vars already exists — leaving it unchanged"
fi

say "Applying local D1 migrations"
pnpm migrate:local

say "Seeding the friends group into the local database"
pnpm seed:local

say "Local development is ready — run 'pnpm dev'."
say "Next: run 'pnpm bootstrap:gha' to configure pipeline secrets, then push to main."
