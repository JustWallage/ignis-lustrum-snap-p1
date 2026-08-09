# Ignis Snaps

A Game Boy-style overworld for the ignis friends group, live at **https://snaps.justwallage.nl**.

Anyone can walk the pixel town without an account. Signed-in friends hand in one photo "snap" a day
to the jury NPC, rank each other's anonymously, and an admin runs a live event — countdown, reveal,
prize wheel — that scores the day and turns the clock over. After day 14 the jury schedule wraps and
play continues.

Walk with the arrow keys / WASD or the on-screen d-pad. `A` (Enter / Z) talks to whatever you face,
`B` speaks, `SELECT` (`c`) opens the menu, `START` returns to the title screen.

One Cloudflare Worker serves the React SPA and a Hono API; photo and sprite bytes live in R2 with D1
holding the rows that name them, and one Durable Object carries the live event and everyone's
footsteps. Walking is public — the SPA, `/api/state`, `/api/event` and `/api/ws`; everything else
sits behind a JWT session cookie.

## Setup

1. Fill `.env` (see `.env.example`), then `pnpm bootstrap` (deps, `.dev.vars`, migrate + seed).
2. `pnpm dev` on port 5173. Log in as any name in `users.example.json` — the real roster is the
   `USERS_JSON` secret, never a file in this repo.
3. `pnpm bootstrap:gha` pushes the pipeline secrets. Pushing to `main` provisions, tests and deploys.

`pnpm check` is the gate and the pre-commit hook; `pnpm verify` adds Playwright.

Each directory's `CLAUDE.md` holds its invariants. `docs/SPEC.md` is the product intent,
`docs/AGENT-WORKFLOW.md` the contributor protocol, `docs/DEPLOY.md` the pipeline.

Public to read, not licensed for reuse — it's a private thing for 14 people that happens to be worth
looking at. All rights reserved.
