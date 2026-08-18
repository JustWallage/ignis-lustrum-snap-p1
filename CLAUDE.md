# Ignis Snaps

Game Boy-style overworld PWA for 14 friends: anyone walks the pixel town, signed-in friends drop
one photo "snap" per day. ONE Worker serves the React SPA + Hono API, image bytes live in ONE R2
bucket (`IMAGES`) with D1 holding only the row that names them, ONE Durable Object (`RealtimeDO`,
`idFromName("global")`) fans out every realtime event.

Read `docs/AGENT-WORKFLOW.md` before starting work, and `docs/DEPLOY.md` before touching
`wrangler.jsonc`, `.github/` or `iac/`. `docs/SPEC.md` is product intent and wins over a ticket.

## Commands

- `pnpm check` — format, lint, types, knip, jscpd, unit tests. Pre-commit hook; never bypass, and
  committing IS running it.
- `pnpm verify` — `check` + Playwright. Both green on a named sha before any reviewer is dispatched.
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
  failed. Never restate the next line, explain a named function, or narrate structure. **Name which
  of those four it is before you write it, or delete it**; a FALSE comment is worse than none, and a
  third copy of what the code and its `CLAUDE.md` already carry is one too many.
- After changing `wrangler.jsonc`, run `pnpm cf-typegen`.

## What every directory agrees on

- **Walking is public, content is not.** `/api/state` and `/api/event` are the ENTIRE public read
  surface. Every image, ballot, scoreboard, sprite, comment, mutation and the town's VOICE is behind
  the cookie — the voice in both directions, since a channel only signed-in friends may transmit on
  is still public if anybody with the URL can listen.
- **The jukebox's audio files are the ONE public payload**, and that is a decision rather than the
  invariant leaking. They are served off the SPA at cacheable unauthenticated URLs, so anybody with
  a URL can listen — and this repo is public (`.gitignore` says so in its own words, which is why the
  roster is not in it), so a song is published twice: in the git history and at that URL. Accepted
  because the payload is **shipped app art, like the tile atlas and the pixel font — not a player's
  photograph, ballot, comment or voice**: nothing about a person is in an mp3 somebody committed. The
  alternative — the Worker serving every byte behind the cookie out of `IMAGES`, like every other
  picture — was considered and rejected, because the authoring story is a file dropped into a
  directory and a redeploy. What is on the WIRE still carries no identity: the track and when it
  started, never who pressed it, so the public frame holds nothing from behind the cookie. Putting a
  record on and stopping one are mutations and stay behind it.
- **The bucket and D1 cannot be atomic**, so the object is written BEFORE its row and deleted
  AFTER it: what leaks is an orphan nobody references, never a row whose image 404s. The Worker
  serves every byte itself — no public bucket, no signed URL.
- **The clock is one `game_state` row.** A day is an integer unrelated to wall-clock time, and it has
  exactly TWO writers: the wheel's landing, which is the only one IN PLAY, and the operator's console
  (`POST /api/admin/day`), which refuses while an event is live. `phase` is a mirror only
  `RealtimeDO` writes, and the two statements that MOVE the day — `advanceDayStatement` and
  `setGameDayStatement` — write the day and nothing else.
- **The live event is authoritative in `RealtimeDO`'s storage, not broadcast**, so a reload or late
  join lands back inside it. Clients never apply a transition from their own response.

**Breaking an invariant means updating that `CLAUDE.md` in the same PR.**
