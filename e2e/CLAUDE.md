# e2e/

Playwright against its own dev server on 5174. `pnpm check` never runs these, so `pnpm verify` is the
gate before a PR.

- **`workers: 1`, one shared database and one browser per project.** A second client is a second
  CONTEXT inside the test, and one left open leaves a rival standing on the map for every spec after.
- `playwright.config.ts` splits specs into `event` and `town` by MEASURED time; CI runs them as two
  jobs, each with its own deployment and database. A new file lands in `town` on its own — move it
  into `EVENT_SPECS` if it belongs with the live event. **Adding a spec does not oblige you to
  re-measure or re-document the split**: no timings are recorded in that config, deliberately, and
  restating them per ticket is how it became a conflict on four branches at once.
- `fixtures.ts` is the only shared file, deliberately: a per-spec copy of `walk` or `pressStart` is how
  the suite drifts. Every test starts seeded, reset and **anonymous**, because walking must work
  without a session.
- `/api/test/*` exists because no test environment has either Gemini key or an `AI` binding, so a player
  wearing a sprite, a jury caption, an out-of-ink quota and a revealed day you can still walk around in
  are all otherwise unreachable. Everything else about those routes is real.
- **A DOM assertion resolves one frame BEFORE the pixels follow it** — the badge can read DAY 15 while
  the canvas holds day 4's judge. Sample after the next painted frame. `spriteFingerprint` reads a
  sprite's CENTRE column, because two judges can share a centre colour and the column never falls
  through to the animating terrain.
- `page.clock`: `setFixedTime` FREEZES (a screen pinned inside the parade never leaves it), so use
  `setSystemTime` when the point is that the event runs itself. Pin BEFORE the first paint when the
  claim is about a late joiner. It fakes the clock and leaves the page's own timers running, so a
  pin reaches the screen on that page's next tick and NOT in the statement after it — read what it
  changed through a polling assertion, never off a bare sample.
- Nothing a spec does moves a phase except the host's Next and the spin — the winner's on the wheel
  screen, or the host's from the SELECT menu — so reaching one is a WAIT on the DO's alarm. When a
  press does turn a page, wait for the page to LAND read off the
  authority: waiting for a build-up line to disappear looks equivalent and is not, because it has not
  appeared yet in the beat after the click, so the second press hits the same stage and the DO 409s.
- Playwright calls anything with a box "visible", **including an element clipped by
  `overflow: hidden`** — check against the container's own box.
- Collect a notice's text AFTER each press and count the element rather than asking whether it is
  VISIBLE: a page that just turned is momentarily empty, and an empty paragraph has no box.
- Hovering a dialogue choice SELECTS it, so drive the cursor with the D-pad when the cursor is under
  test, and park the pointer off the shell.
- Hold a response open with route interception to see a pending state; a fast local server is exactly
  the wrong thing to race.
- **A negative needs something positive behind it**: "nothing happened" passes just as happily against
  a request that had not landed. Assert the 409, or that no request was made.
- Seeding and resetting are POLLED: in CI the suite runs against a Worker deployed seconds earlier, and
  whichever spec sorts first would otherwise eat the cold start.
- The e2e project cannot see `src/`, so a palette colour a spec needs is hardcoded (knip would read an
  e2e-only export as dead code).
- `round-trip.spec.ts` decodes a low-density QR fixture back off the served `<img>`, so a degraded
  round trip (downscale → JPEG → R2 → back) fails loudly instead of passing as a 201. Enlarging the
  fixture to make it pass misses the point.
- Every e2e run shares ONE R2 bucket and is isolated by `IMAGE_PREFIX`, which `/api/test/reset` sweeps
  — so the reset every test starts with empties the bucket as well as the tables.
