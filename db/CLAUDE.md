# db/

`schema.ts` is the Drizzle source of truth. A `schema.ts` change needs `pnpm migrate:gen` and the
generated SQL committed — **nothing in `pnpm check` notices a missing migration**, and prod then
deploys a schema without the column while everything stays green.

- **Unique indexes are the enforcement, not the routes**, because a read-then-write leaves a window
  two racing requests both pass through: `photos_user_day_idx` (one submission per user per day, the
  route 409s on the violation), `photo_scores_photo_idx` (one verdict, so a re-rank REPLACES the day's rows),
  `day_rankings_day_idx` (one batch state per day, so claiming a run stamp is one upsert two racing
  re-ranks cannot both win),
  `photo_descriptions_photo_idx` (one description, so the console's retry is an upsert too),
  `prize_awards.day` (one award, so a repeated landing rolls its batch back), `bowser_days.day` (a
  day is marked once, so marking it twice is the same marked day rather than a refusal),
  `rigged_days.day` (a day has ONE rigged prize, so rigging it again REPLACES rather than adds), the
  two on `votes`, and `avatar_generations (user_id, day)` bumped by an UPSERT that returns the new
  value.
- `game_state` is one row pinned to `id = 1`, and it, `SEED_PRIZES` and the two `settings` rows are
  seeded by their MIGRATION rather than `scripts/seed.mjs`, so every environment with the schema has a
  wheel that can already spin and caps already in force. Migrations cannot import TypeScript, so the
  prize labels and both avatar caps exist twice; `worker/prizes.test.ts` and
  `worker/lib/avatar-caps.test.ts` hold each pair together.
- **`settings` is config, and `game_state` is the CLOCK** — the avatar caps went here rather than as
  two more columns on that row precisely so the next unrelated setting has somewhere to go that is not
  the day. Values are integers; a cap of 0 is a closed machine, and `readAvatarCaps` falls back to the
  seeds so a lost row cannot 500 a route every player hits.
- **No image bytes are in D1 at all** — snaps and sprites live in the `IMAGES` bucket, and these tables
  only NAME them: `photos.r2_key` is the whole key, and a sprite's is `sprites/` + `users.avatar_key`,
  both prefixed by `IMAGE_PREFIX` where one is set. A snap's key is generated before the insert rather
  than derived from `photos.id`, because an autoincrement id does not exist until the row does and an
  object cannot be written before its name. Migration `0013` stamps `snaps/<id>` on every row the
  backfill saw, which is exactly what `scripts/backfill-images.mjs` wrote to the bucket in the deploy
  step before it.
- **`avatar_sprites` is the history and `users` only POINTS at it.** The table is insert-only: a row
  per drawing, never updated and never pruned, so `key` and `content_type` describe bytes that cannot
  change under them. The two remaining `users` avatar columns go together — either being null means
  "wearing the default" — and one statement writes both, so nothing may set them piecemeal.
  `avatar_key` is still the handle everybody ELSE loads through and still the object's name, but it
  no longer rotates per generation: an old sprite can be WORN again, so a key may be current, then
  not, then current once more. `users_avatar_key_idx` still holds, because a key belongs to one
  drawing and a drawing to one player.
- **Nothing deletes a sprite, in D1 or in the bucket.** A superseded one used to go with its columns;
  it stays, or the history is a gallery of broken images and nothing can be put back on. Growth is
  accepted: the caps bound the RATE (ten a player, fifty a town, per day), never the total.
- **`retired_photos` copies a photo's identity as that photo DIES**, which is why `photo_id` cannot
  be a foreign key: D1 enforces them and the `photos` row goes in the same batch that writes this
  one, so `.references(() => photos.id)` would make every retirement fail. `r2_key` is nullable and
  unique — nullable because a legacy row with no key must still be retirable (a day the operator
  cannot empty is worse than a retirement with no backup to show), unique because one object is
  retired once, and it is what the console's bucket view joins on. The picture it names is NOT
  deleted: that is the whole point of the table.
- `comments` names its subject with `subject_type` + `subject_id` rather than a photo foreign key, so
  one table, one route and one component serve snaps and sprites alike. The pair references no table,
  so whatever deletes a subject deletes its comments — `purgePhoto` does, and a sprite is never
  deleted, which is why nothing sweeps those.
- `photos.day`'s default exists only so its migration could backfill; every insert stamps it from
  `game_state.day`. `photos` has no `x`/`y` and no `caption`.
- **`photo_scores.ai_score` is a REAL, and within a day those reals are DISTINCT** — the jury ranks
  the whole day in one call and the score IS that order, so nothing stores a rank beside it and two
  fields cannot disagree about the same photograph. `src/lib/rating.ts` rounds every readout, which
  is why 8.4 and 8.1 both print `8/10` while one still stands above the other. The day-level fallback
  stores 5 with `ai_status = 'failed'` for every snap of the day, because a MISSING row reads as "not
  ranked yet" forever — that one day is all fives and `scoreDay` gives such a field the median.
- **`day_rankings` is per-day batch state, not config, which is why it is a table and not
  `settings`** — that one is integers an admin PATCHes, seeded by migration. `run_stamp` is a
  monotonic claim (newest run wins, and an overtaken run writes nothing further); `ran_at` is null
  until a run FINISHES and `status` is written `failed` at CLAIM time, so a run that never comes back
  reads as a failure rather than leaving the previous success standing. "Generated" and "when it last
  ran" are derivable from the rows; **"the last run failed" is not** — a failed run deliberately
  leaves the previous verdicts in place, so nothing in `photo_scores` records that it happened. Like
  `bowser_days` and `rigged_days` it is keyed by an integer day with no relation to the wall clock,
  and nothing expires it.
- **`photo_descriptions` is a FACT about the picture, `photo_scores` a VERDICT about the day** — which
  is why the text is not two more columns on that table. A ranking upserts each verdict WHOLESALE
  (`onConflictDoUpdate({ set: row })`), so a description sharing the row is erased by any writer
  that forgets it, and `ai_status` would have to mean two things at once for a snap described but not
  scored. It carries its own `status` for exactly that reason, stores a failed row with text saying
  so (same absence problem as above), and `photo_descriptions_photo_idx` is what makes the console's
  retry an upsert.
- `prize_awards.prize_label` is TEXT, not a foreign key: prizes are editable and retirable, and an
  award must survive its segment being renamed.
- **`prizes.prize_set` is a COLUMN rather than a second table**, so the two sets share one router,
  one serializer, one ordering and one row editor — a sibling table is what jscpd catches at 1%. Its
  `DEFAULT 'ordinary'` is what backfilled every seeded row when `0018` added it, which is why `0007`
  was never touched. `bowser_days` is the other half: a marked day is an integer with no relation to
  the wall clock and **nothing expires it**, so winding the console's clock back over one replays it
  as a Bowser day. The Bowser set is seeded by NOBODY and ships empty on purpose — no second copy of
  any labels for `worker/prizes.test.ts` to hold together.
- **`rigged_days` is the second day-keyed admin table and behaves like the first**: an integer day
  with no relation to the wall clock, nothing expires it, so winding the clock back over a rigged day
  replays that landing exactly as it replays a Bowser mark. `prize_id` is **not** a foreign key —
  D1 enforces them, and the prize manager's Delete must not fail on a rigged row — so a rig can
  outlive its prize, which the DO reads as no rig at all. It names a ROW and never an index, for the
  same reason `prize_awards.prize_label` is a copy: prizes are renamed, reordered and retired.
- `game_state.phase` is plain text parsed through `gamePhaseSchema` on the way out. The DB does not
  decide what a phase is, and `RealtimeDO` is its only writer.
