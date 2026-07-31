# db/

`schema.ts` is the Drizzle source of truth. A `schema.ts` change needs `pnpm migrate:gen` and the
generated SQL committed — **nothing in `pnpm check` notices a missing migration**, and prod then
deploys a schema without the column while everything stays green.

- **Unique indexes are the enforcement, not the routes**, because a read-then-write leaves a window
  two racing requests both pass through: `photos_user_day_idx` (one submission per user per day, the
  route 409s on the violation), `photo_scores_photo_idx` (one verdict, so `scorePhoto` is an upsert),
  `prize_awards.day` (one award, so a repeated landing rolls its batch back), the two on `votes`, and
  `avatar_generations (user_id, day)` bumped by an UPSERT that returns the new value.
- `game_state` is one row pinned to `id = 1`, and it, `SEED_PRIZES` and the two `settings` rows are
  seeded by their MIGRATION rather than `scripts/seed.mjs`, so every environment with the schema has a
  wheel that can already spin and caps already in force. Migrations cannot import TypeScript, so the
  prize labels and both avatar caps exist twice; `worker/prizes.test.ts` and
  `worker/lib/avatar-caps.test.ts` hold each pair together.
- **`settings` is config, and `game_state` is the CLOCK** — the avatar caps went here rather than as
  two more columns on that row precisely so the next unrelated setting has somewhere to go that is not
  the day. Values are integers; a cap of 0 is a closed machine, and `readAvatarCaps` falls back to the
  seeds so a lost row cannot 500 a route every player hits.
- **Every image is base64 in a text column** — snaps and sprites alike (**no R2**; the CI token cannot
  manage it), downscaled client-side and re-checked in the worker, well under D1's ~2 MB per value.
- The four avatar columns go together: any of the first three being null means "still on the default",
  so nothing may set them piecemeal. `avatar_key` is the rotating handle everybody ELSE loads through.
- `photos.day`'s default exists only so its migration could backfill; every insert stamps it from
  `game_state.day`. `photos` has no `x`/`y` and no `caption`.
- `photo_scores.ai_score` stores 5 with `ai_status = 'failed'` on failure, because a MISSING row reads
  as "not evaluated yet" forever.
- `prize_awards.prize_label` is TEXT, not a foreign key: prizes are editable and retirable, and an
  award must survive its segment being renamed.
- `game_state.phase` is plain text parsed through `gamePhaseSchema` on the way out. The DB does not
  decide what a phase is, and `RealtimeDO` is its only writer.
