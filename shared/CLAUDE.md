# shared/

Everything both sides read. Change a schema here first.

- **Nothing outside `scoring.ts` does the arithmetic.** `scoreDay` ranks one day; `rankStandings`
  only ADDS those totals. Re-deriving at the table's level is how the standings and archive start
  disagreeing, and every constant is named here.
- **Both halves are curved against the day's BEST value**, never a theoretical maximum — the only way
  peer votes (0–39) and an AI score (1–10) carry equal weight.
- `aiScore: 0` means "no evaluation row", not zero, so it contributes nothing; on the wire an absence
  is an absence and nothing may render 0/10. `aiNorm` is the day's CURVE, never a rating —
  `curve(best, best)` is exactly `HALF_WEIGHT`, so the best AI score always reads 50, and printing
  that under a bare "AI" is the whole of #97.
- The ×0.5 no-vote penalty applies AFTER the bonus. Ties break three keys deep, so a day has exactly
  one winner and ranks run 1..n.
- **Every event moment is an absolute epoch-ms target**, so a screen renders its own progress by
  asking its own clock where that moment is: two screens cannot drift and a late join is not behind.
- `nextDeadline` is the ONE place that says what ends a phase, and the DO arms its alarm off the same
  function the pixels read. **Null is normal play and nothing else** — the two stages waiting for a
  person carry `stageEndsAt`, so an unspun wheel cannot hang the event.
- `stageEndsAt` means two things and only the DO tells them apart: when the stage gives way, or when
  the DO LOOKS UP at the host's presence.
- **`revealStage`'s branch order is load-bearing**: the published stage beats the clock. A
  clock-derived parade survives skew; a podium rank does not, and checking the clock first left a
  slow client parading while everyone else was on third.
- `podiumRank` is the ONE field saying which reveal page is up, so there is no fourth phase to
  disagree with it. The beast is a MOMENT on the wheel (`beastEndsAt`), not a fourth reveal page.
  `draftOf` drops the day rather than listing fields, so a new state field survives a transition by
  default — but **only `podiumEvent` and `podiumAdvanceEvent` go through it**. `countdownEvent`,
  `revealEvent`, `wheelEvent` and `spunEvent` REBUILD from `idleEvent()` and then list their fields,
  so a field of the wheel's is stated again in `spunEvent` or it is lost the instant the winner
  presses SPIN. `beastEndsAt` is worse than lost: `spunEvent` hands `wheelEvent` a fresh `now`, which
  restamps it, and the beast replays over the landing while the flag and the segments both survive —
  so a test that only checks the colour and the prizes stays green through it.
- Movement goes through `stepTarget`, which returns where a step LANDS or `null` for a bump. **Never
  fork the terrain.** `WalkableTile` is a UNION because `src/lib/sound.ts` keys its footstep table by
  it: nothing becomes walkable without a decision about what it sounds like.
- The archive door is SOLID and carries the player two tiles in one stride; whether a step is that
  transit is the map's question (`stepsThroughDoor`), never derived from how far anybody moved.
- NPC tiles are grass made unwalkable — a person is somebody you bump into, not terrain.
- **`presenceFrameSchema` is all the DO parses**, so a fifth inbound frame is a member of it or it
  does not exist — and **none of its four carries identity**: name, id and sprite URL are resolved
  from the cookie, so a client has nowhere to put one. The roster's sprite is an opaque URL rotating
  every generation — what somebody wears, nothing about who they are. **The one inbound thing that
  is NOT a member is a binary voice chunk**, which cannot be parsed at all: the DO takes bytes as
  samples only from a socket already holding the channel through `talk_start`, drops anything over
  `TALK_FRAME_MAX_BYTES`, and relays the rest untouched. A chunk is never an implicit press, which
  is what lets it travel with no header saying whose it is — half-duplex settles that, and the lock
  is what keeps it half-duplex.
- `WS_EVENT_TYPES` and `REVALIDATE_EVENT_TYPES` are DERIVED from the schema union, never
  hand-maintained: a forgotten entry fails silently, and treating a position frame as content news
  turns a stroll into a load test.
- `juryForDay` WRAPS, so day 15 is jury 1 and play continues. `capOptions` never returns an empty
  list, because an option is a BUTTON LABEL. The `prizes` migration duplicates `SEED_PRIZES` in SQL
  because migrations cannot import TypeScript; `worker/prizes.test.ts` holds the two together.
- **`ordinary` is the prize set everywhere it is not said** (`prizesPath`, and the route's own
  fallback for an unreadable `?set=`): `GET /api/prizes` has live callers that read or patch the
  whole list, and a default answering both sets turns four unrelated tests red for a reason nobody
  would connect to Bowser days.
