# worker/

- **Registration order in `index.ts` is load-bearing.** `app.use("/api/*", authMiddleware)` is the
  public/private boundary; above it only `/api/ws`, the auth routes, `/api/state`, `/api/event`.
  `/api/photos/:id/comments` before `/api/photos` and `/api/avatars/:id/comments` before
  `/api/avatars`; `/api/photos/mine` before `/api/photos/:id`
  (else `Number("mine")` 404s); `/api/event` twice — public `GET`, then `POST /spin` below.
- **Identity comes only from `middleware/auth.ts`.** Routes read `c.get("user")`, never the cookie.
  `/api/ws` sits above the middleware and calls `optionalUser(c)` from that same module.
- Sessions slide under 7 days left. **No revocation** — rotating `JWT_SECRET` is the only kill
  switch.
- `photos.day` is stamped from `game_state.day`, never the client. **One per user per day, only in
  `submission`**, enforced by `photos_user_day_idx`: the route reads no state, inserts, and turns
  the UNIQUE violation into a 409, so two racing POSTs cannot both land. Replace is purge + insert
  in ONE `db.batch`, or a landed delete leaves a player with nothing in. `purgePhoto`
  (`lib/photo-rows.ts`, beside the ONE aggregate query both the photos router and the console's day
  listing read a snap through) is the one place a photo's dependants die — and one of them is not a
  table: the R2 object goes after the batch, never inside it. **Retiring is that same purge with a
  `retired_photos` insert in FRONT of it and no object delete at all**, which is what leaves the
  picture in the bucket; the row dying rather than gaining a flag is also what frees the player's
  `photos_user_day_idx` slot to re-shoot the day. Nothing writes a photo caption (#72).
- **Anonymity is server-side.** `uploader: null` unless it is yours or the day is revealed;
  `/api/votes/candidates` selects no uploader column at all. `toPhoto` masks name and verdict as
  TWO decisions — your own snap always carries your name, and no verdict until the day is out,
  admins included. Commenters ARE named on any day: the secret is whose snap it is.
- **The self-exclusion lives only in `PUT /api/votes`**, never in `candidates`. **Do not unify the
  two queries** — a shared "today's photos" helper is exactly how self-voting comes back.
- `lib/day-results.ts` is the only place a `DayResult`'s rows are gathered — its three callers are
  why the wheel cannot spin for somebody the scoreboard disagrees with. An unrevealed day is a
  **403, not an empty list**. `prize_awards.prize_label` is read without joining `prizes`: the
  label is a copy taken at award time, so renaming a segment cannot rewrite last week's trophy.
- **`RealtimeDO` is the only writer of `game_state.phase`**, and `publish` its one write path. IN
  PLAY the day is READ, not chosen, which is why aborting cannot increment it — `setGameDayStatement`
  writes the day and nothing else, so neither the operator's clock nor `/api/test/*` can put a phase
  in behind the DO's back. The clock route is the day's second writer and refuses while an event is
  live, so the phase it leaves alone is always `submission`; it deletes every `prize_awards` row at
  or after the target day in the SAME batch, because `prize_awards_day_idx` is unique and a leftover
  makes the replayed landing roll its own batch back.
- **Every transition runs alone.** Read-decide-publish with an `await` between, so two arriving
  together both read pre-write state: two Next presses once bought two advances and skipped a rank.
  `alone` is the queue every RPC and the alarm pass through, and the 409s only bite inside it.
- `alarm()` guards on the DEADLINE as well as the phase — the reveal's stages share one phase and a
  duplicate delivery would skip a page.
- `hostUserId` is frozen from the session that pressed START, then narrowed to that id (403 for the
  other admin). The reveal likewise FREEZES its winner; nothing recomputes it.
- **The landing closes the day atomically**: award row and `advanceDayStatement` in the SAME
  `db.batch`, or a day advances without a claimable prize. An abort and a day nobody submitted to
  both end with no landing and no increment; below `MIN_ENABLED_PRIZES`, START refuses with the
  reason, because at the button there is still an admin to tell.
- **Presence lives in the socket's ATTACHMENT, never a field on the class** (hibernation) — a field
  would be a roster that quietly emptied itself. `presenceUpgrade` builds the DO's request FROM
  SCRATCH, so a client cannot smuggle a name, id or sprite. Expiry is by silence as well as by
  close, and the event's idle check works only because `PRESENCE_TTL_MS < HOST_IDLE_MS`.
- **The voice fanout is the ONE filtered fanout.** Everything else reaches every socket, an
  anonymous visitor's included, because walking is public — but `fanoutHeard` skips a socket with no
  name, or the town's channel is open to anybody holding the URL. Both talk frames and every audio
  chunk go through it. The channel LOCK lives in the socket's attachment as `talking`, beside
  `saidAt`: `webSocketMessage` is synchronous, so an attachment needs no `alone()` where a storage
  key would. It frees itself by SILENCE the way `expireGhosts` does, never by an alarm — the DO has
  one slot and the event's deadlines own it — so a tab that dies mid-sentence cannot hold the town.
- `lib/gemini.ts` (REST) and `lib/npc.ts` (Workers AI) are not interchangeable. **Verify both model
  ids against the provider's docs, never from memory.** `AVATAR_IMAGE_SIZE` is a PRICE. Gemini
  throws and callers decide differently on purpose; for the NPC, offline is a normal path.
- **The neighbour's roster is `select name from users`, never `USERS_JSON`** — that var is a
  credential blob, and the prompt builder cannot leak a password it has no way to reach. NAMES only,
  and an unreadable roster drops the names line and nothing else.
- **`AI` is production-only, not by choice**: no local emulation, so declaring it in `local` stops
  `pnpm test:unit` and in `e2e` stops `pnpm dev:e2e`. `remote: false` does not help. **`IMAGES` is
  the opposite case and must not copy it**: miniflare simulates R2 in both the vitest pool and
  `wrangler dev`, so the bucket is declared in all three blocks.
- **`lib/images.ts` is the only module that touches the bucket.** Object BEFORE row, row BEFORE
  object-delete, so the only thing that can leak is an orphan. A missing object is a 404, never a
  500, and the admin retry SKIPS a row whose object has gone rather than scoring an empty image.
- **Two Gemini keys, no fallback between them**: `GEMINI_API_KEY` judges photographs,
  `GEMINI_API_KEY_PAID` draws avatars, and the billed one is the only thing `lib/avatar.ts` will
  reach for. Falling back either way spends the wrong key. Both are optional everywhere — without
  one the jury scores 5, without the other the avatar machine answers "offline", and local and e2e
  depend on both. Every test helper pins BOTH variables, because the vitest pool reads a
  developer's `.env` and absence is never the default.
- **The jury never blocks an upload**: `waitUntil`, and any throw stores score 5,
  `ai_status = 'failed'` and NO caption. It UPSERTs, which makes one function both the first pass
  and the admin retry.
- **Avatars are the opposite trade**: synchronous, no fallback, a failure the player reads. Two caps
  are STORED config an admin PATCHes (`settings`, seeded with what used to be compiled in), and 0 is
  legal — a closed machine. They are decided in ONE statement so two requests cannot spend the last slot;
  the slot is taken before the model call and refunded by every path that stores no sprite.
  `storeAvatar` puts the object, inserts the `avatar_sprites` row, then points `users` at it — and
  **deletes nothing**, which is what makes the history re-wearable. `/api/sprites/:key` is a router
  of its own so "whose sprite?" never enters it, and it resolves against the HISTORY: the moment a
  key stopped being worn it used to 404, which is a gallery of broken images. A URL is still
  immutable and cacheable — the same key serves the same bytes forever — but a key is no longer seen
  once, because an old sprite can be worn again.
- **`POST /api/avatar/worn` draws nothing**: no model call, no slot taken, nothing refunded, since
  `avatar_generations` counts drawings and a switch is free. It takes an id out of `/api/avatars` and
  answers 404 for one that is not yours as well as for one nobody drew — ONE refusal, so the two
  cannot disagree about which it is. It broadcasts what a fresh drawing broadcasts. `clearAvatar`
  takes off what you WEAR and nothing else.
  **`/api/avatars` pairs a name with every key that name has ever drawn** — wider than the presence
  roster, which pairs a name only with what somebody is wearing. A deliberate widening, behind the
  cookie, going ONE way: owner → their keys. There is still no route answering "whose sprite is this
  key?", which `/api/sprites/:key` refuses and must keep refusing. `pushSprite` broadcasts
  `avatar_changed` as well as the roster frame, because `presence_*` is not content news and the
  roster frame skips the socket that generated.
- **`commentRoutes(subject)` is ONE thread router mounted per subject**, under `/api/photos/:id` and
  `/api/avatars/:id` alike — a second router differing only in the noun is how the two would drift
  apart on who may delete what. The avatar mount sits above its listing to match the photos pair, not
  because it must: `townAvatarRoutes` declares only `/`, so nothing there could swallow it. Nothing
  on a sprite thread is anonymous: the gallery already prints the name beside every face.
- ONE `isAdmin` gate on the admin sub-router, not per handler — which is why the console's routers
  are mounted ON `adminRoutes` rather than in `index.ts`, where `adminEventRoutes` sits outside that
  gate and carries its own. What it serves is COUNTS, CONFIG and the operator's LEVERS — the clock,
  retirement and the bucket — plus, for RETIRED KEYS ONLY, bytes: a retired snap has no `photos` row
  left to serve it through, and it is the one object the console can render because
  `retired_photos` is the only thing still naming its content type. A true orphan is listed as a key
  and a size and never fetched, a live snap and a sprite keep their own routes, and no score or
  sprite is served here. The caps PATCH is the one config lever, a count is not, and neither it nor
  a retry broadcasts; retirement broadcasts `photo_deleted` per snap AND pushes the state, because
  only `state_changed` carries the submission count. The bill is an ESTIMATE computed in the
  worker — Google reports no billing figures — so a price per image never crosses the wire.
  **`POST /api/admin/bench` is the one exception to all of it**: the only Gemini call in the app
  with no snap behind it. It scores a picked image against a jury picked BY INDEX out of `JURIES`
  and stores NOTHING — no `photos` row, no `photo_scores` row, nothing counted, nothing
  broadcast — so a bench press cannot touch a day and appears in no estimate. It reads the jury's
  own `GEMINI_API_KEY`, never the avatar machine's `GEMINI_API_KEY_PAID`, answers a readable
  "offline" without one, and sits behind `rateLimiter` because a billed multimodal call with a
  button in front of it is a button somebody holds down.
- `/api/test/*` 404s outside local/e2e, failing closed on an unknown `ENVIRONMENT`. Each route
  exists because its state is otherwise unreachable; `reset` winds the stored event AND its pending
  alarm back, or the next test opens inside the last one's event.
- `broadcast` is best-effort and never fails a mutation. Anything moving the clock also calls
  `pushGameState`. `/state` only remembers, so `/api/ws` can warm a cold DO without re-notifying
  everyone already in sync.
