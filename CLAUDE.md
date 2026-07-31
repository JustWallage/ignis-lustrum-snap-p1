# Ignis Snaps

Game Boy-style overworld PWA for 14 friends: anyone walks the pixel town, signed-in friends drop
one photo "snap" per day. ONE Worker serves the React SPA + Hono API, snap bytes live base64 in D1
(**no R2 — the CI token has no R2 permissions**), ONE Durable Object (`RealtimeDO`,
`idFromName("global")`) fans out every realtime event.

Read `docs/AGENT-WORKFLOW.md` before starting work, and `docs/DEPLOY.md` before touching
`wrangler.jsonc`, `.github/` or `iac/`. `docs/SPEC.md` is product intent and wins over a ticket.

## Commands

- `pnpm check` — format, lint, types, knip, jscpd, unit tests. Pre-commit hook; never bypass.
- `pnpm verify` — `check` + Playwright. Run before opening a PR.
- `pnpm dev` — dev server on 5173. `node scripts/ticket.mjs` — the backlog CLI, bare for its help.

## Hard rules

Each is a failure that happened:

- **No `as` casts** (only `as const`) and no non-null assertions. Parse a `shared/` schema instead.
- **Boundary types live in `shared/`** (`z.infer`) or come from Drizzle inference. Never redefine.
- **Responses are built by `.parse(...)`ing a `shared/api.ts` schema** (`worker/lib/serialize.ts`).
- **knip fails on unused exports, files, deps.** Never export "for later".
- **jscpd fails at 1% duplication.** Build on the existing primitive, not a sibling copy.
- **Comments are gotchas only** — the codebase sits near 3%. A comment must state what the code
  cannot: an outage it prevents, a platform behaviour, an ordering constraint, an alternative that
  failed. Never restate the next line, explain a named function, or narrate structure.
- After changing `wrangler.jsonc`, run `pnpm cf-typegen`.

## What every directory agrees on

- **Walking is public, content is not.** `/api/state` and `/api/event` are the ENTIRE public read
  surface. Every image, ballot, scoreboard, sprite, comment and mutation is behind the cookie.
- **The clock is one `game_state` row.** A day is an integer unrelated to wall-clock time, advanced
  in exactly ONE place — the wheel's landing. `phase` is a mirror only `RealtimeDO` writes.
- **The live event is authoritative in `RealtimeDO`'s storage, not broadcast**, so a reload or late
  join lands back inside it. Clients never apply a transition from their own response.

**Breaking an invariant means updating that `CLAUDE.md` in the same PR.**
