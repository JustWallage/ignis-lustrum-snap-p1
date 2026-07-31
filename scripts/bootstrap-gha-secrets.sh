#!/usr/bin/env bash
# Copies the Cloudflare/Terraform/auth inputs from root .env into this repo's
# GitHub Actions secrets. Idempotent and safe to re-run after rotating a value.
#
# JWT_SECRET is generated if absent; ADMIN_NAMES defaults to "just". USERS_JSON
# is REQUIRED and comes from .env alone — this repo is public, so the roster is
# never committed and there is nothing on disk to fall back to. This project
# does NOT use Cloudflare Access, so the ACCESS_*/GOOGLE_* variables are ignored.
set -euo pipefail

cd "$(dirname "$0")/.."

say() { printf '\033[1;32m[bootstrap:gha]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[bootstrap:gha]\033[0m %s\n' "$*" >&2; exit 1; }

[ -f .env ] || die "Missing .env — copy .env.example and fill it in."
set -a
# shellcheck disable=SC1091
source .env
set +a

required_keys=(
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN
  TF_STATE_BUCKET
  CLOUDFLARE_R2_ACCESS_KEY_ID
  CLOUDFLARE_R2_SECRET_ACCESS_KEY
  WORKERS_DEV_SUBDOMAIN
)
for key in "${required_keys[@]}"; do
  [ -n "${!key:-}" ] || die "Missing $key in .env"
done

command -v gh >/dev/null || die "gh CLI is required"
gh auth status >/dev/null || die "gh is not logged in — run: gh auth login"

# `gh secret set` targets the repo of the CURRENT directory's remote, and more
# than one repository has been pointed at this Cloudflare account and this
# production worker. Name the target out loud before writing anything to it.
target_repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)" ||
  die "No GitHub repository for this directory — create it and add the remote first."
say "target repository: $target_repo"

set_secret() {
  printf '%s' "$2" | gh secret set "$1"
  say "set $1"
}

for key in "${required_keys[@]}"; do
  set_secret "$key" "${!key}"
done

# Auth secrets — generated/derived when not supplied in .env.
jwt_secret="${JWT_SECRET:-}"
if [ -z "$jwt_secret" ]; then
  jwt_secret="$(openssl rand -hex 32)"
  say "generated a fresh JWT_SECRET"
fi
set_secret JWT_SECRET "$jwt_secret"

# Every login in production is hashed from this one value at deploy time, and a
# malformed one fails there rather than here — where nobody is watching. Keep it
# on ONE line in .env: `source` would otherwise stop at the first newline and
# push a truncated roster that parses as nothing.
users_json="${USERS_JSON:-}"
[ -n "$users_json" ] || die "Missing USERS_JSON in .env — this repo is public, so the roster lives only there."
printf '%s' "$users_json" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("not a non-empty array");
    for (const u of parsed) if (!u?.name || !u?.password) throw new Error("an entry is missing name or password");
    console.error(`[bootstrap:gha] USERS_JSON parses — ${parsed.length} users`);
  });
' || die "USERS_JSON in .env is not a JSON array of {name, password}"
set_secret USERS_JSON "$users_json"

set_secret ADMIN_NAMES "${ADMIN_NAMES:-just}"

# Both Gemini keys are optional and neither falls back to the other: without the
# jury's the worker scores every submission through its failure path, without the
# paid one the avatar machine answers "offline". Either way it still deploys, so
# never push an empty secret.
if [ -n "${GEMINI_API_KEY:-}" ]; then
  set_secret GEMINI_API_KEY "$GEMINI_API_KEY"
else
  say "no GEMINI_API_KEY in .env — skipping (AI evaluation will take its failure path)"
fi

if [ -n "${GEMINI_API_KEY_PAID:-}" ]; then
  set_secret GEMINI_API_KEY_PAID "$GEMINI_API_KEY_PAID"
else
  say "no GEMINI_API_KEY_PAID in .env — skipping (the avatar machine will answer offline)"
fi

say "Done. GitHub Actions can now provision and deploy this project."
