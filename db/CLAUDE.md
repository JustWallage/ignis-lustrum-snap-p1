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
  unique — nullable because a legacy row with no key must still be retirable (a day it cannot empty
  is worse than a retirement with no backup to show), unique because one object is retired once, and
  it is what the console's bucket view joins on. The picture it names is NOT deleted: that is the
  whole point of the table — which also makes this the one table `/api/test/reset` must empty
  BEFORE `sweepImages`, or its rows outlive the objects they name.
- `comments` names its subject with `subject_type` + `subject_id` rather than a photo foreign key, so
  one table, one route and one component serve snaps and sprites alike. The pair references no table,
  so whatever deletes a subject deletes its comments — `purgePhoto` does, and a sprite is never
  deleted, which is why nothing sweeps those.
- `photos.day`'s default exists only so its migration could backfill; every insert stamps it from
  `game_state.day`. `photos` has no `x`/`y` and no `caption`.
- `photo_scores.ai_score` stores 5 with `ai_status = 'failed'` on failure, because a MISSING row reads
  as "not evaluated yet" forever.
- `prize_awards.prize_label` is TEXT, not a foreign key: prizes are editable and retirable, and an
  award must survive its segment being renamed.
- `game_state.phase` is plain text parsed through `gamePhaseSchema` on the way out. The DB does not
  decide what a phase is, and `RealtimeDO` is its only writer.
