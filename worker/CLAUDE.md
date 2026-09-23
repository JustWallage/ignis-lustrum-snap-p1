# worker/

- **Registration order in `index.ts` is load-bearing.** `app.use("/api/*", authMiddleware)` is the
  public/private boundary; above it only `/api/ws`, the auth routes, `/api/state`, `/api/event` and
  `/api/public` — the last one the only thing in front of the cookie that serves a photograph, and
  the root `CLAUDE.md` states what it may serve and why.
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
  in ONE `db.batch` — whose positional holes are counted from what `purgePhoto` returns, so a new
  dependant is a hole too — or a landed delete leaves a player with nothing in. `purgePhoto`
  (`lib/photo-rows.ts`, beside the ONE aggregate query both the photos router and the console's day
  listing read a snap through) is the one place a photo's dependants die — the verdict, the
  description, the votes, the likes and the thread — and one of them is not a table: the R2 object
  goes after the batch, never inside it. **Retiring is that same purge with a
  `retired_photos` insert in FRONT of it and no object delete at all**, which is what leaves the
  picture in the bucket; the row dying rather than gaining a flag is also what frees the player's
  `photos_user_day_idx` slot to re-shoot the day. **`photos.caption` is written by ONE route and
  only by its photographer** — `PUT /api/photos/:id/caption`, which 403s everybody else, the admin
  included: retiring a snap is moderation, rewriting its line is putting words in a player's mouth,
  and the console has no pen. An empty body CLEARS the column rather than storing a blank, because a
  reader cannot tell the two apart. The upload form still carries no caption field (#72): a snap
  lands uncaptioned and is captioned afterwards, so the one write path cannot be two.
- **`photos.shared_publicly` and `photos.public_veto` are two routes because they are two people.**
  `PUT /api/photos/:id/public` is the photographer's AND the admin's — choosing what leaves the
  cookie is curation, not speech, so unlike the caption the console does hold a pen here — and
  `PUT /api/admin/photos/:id/veto` is the operator's alone. Neither writes the other's column, so a
  veto outranks a share without erasing it. Nothing is broadcast: a share is not news, and
  `routes/public.ts` is read by people with no socket at all. Both payloads carry the pair AND
  `onPublicPage`, the AND of them with the day's reveal, computed in `serialize.ts` by one function:
  a client that worked it out itself would tell a photographer sharing at upload time that their
  snap was already public, and the gate has to have one owner. `toPhoto` folds in `view.score`,
  which that interface's own doc defines as "a revealed day and nothing else"; `toDayResult` passes
  `true`, because an unrevealed day is a 403 there rather than an empty list.
- **`routes/public.ts` re-asks the WHOLE question for the bytes, not just the listing.** Shared,
  un-vetoed and revealed are ANDed in one place; the image route repeats all three rather than
  trusting a URL, because a link shared onwards outlives the answer that produced it. It is the one
  image route whose `Cache-Control` is `public` and NOT `immutable` — five minutes, because these
  bytes can be withdrawn where every other image URL's cannot.
- **Anonymity is server-side.** `uploader: null` unless it is yours or the day is revealed;
  `/api/votes/candidates` selects no uploader column at all. `toPhoto` masks name and verdict as
  TWO decisions — your own snap always carries your name, and no verdict until the day is out,
  admins included. Commenters ARE named on any day: the secret is whose snap it is — which is
  exactly why `photos.caption` exists and is NOT behind either masking: a photographer explaining
  their own snap in the thread signs it, so the caption is the one line they can put under an
  anonymous picture. It rides `voteCandidateSchema` too, which still selects no uploader column.
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
- **Whether tonight is a Bowser day is READ IN THE DO, from `bowser_days`, and nowhere else** — in
  `startEvent`, so the refusal checks the set the day will actually use and names which one is short,
  and in `wheelDraft`, which stamps the flag and the beast's moment into the wheel it publishes.
  Nothing a player's browser loads asks the question: what it learns is the flag on the wheel it is
  already being sent, and the only surface naming a marked day before it plays is the operator's own
  console (`GET /api/admin/bowser`, admin-gated). **The spin's guard is in
  `spinWheel` with a reason string**, because hiding the button and the SELECT item is only the
  cosmetic half. Marking a day broadcasts nothing (it is config nobody is rendering); a Bowser-set
  prize edit broadcasts `prizes_changed` like any other.
- **The landing is the DO's decision alone, rigged or not.** `spinWheel` reads `rigged_days` for the
  day and lands on that prize where it is among the segments it already published, and on
  `crypto.getRandomValues` where it is not — ONE rule, so retired, deleted, wrong-set and
  renamed-after-the-draft all take the same path and cannot disagree. Like a Bowser mark, a rig is
  written through an admin-gated router (`routes/admin-rig.ts`), read by the DO and that console
  panel and by no player-facing route, and **broadcasts nothing** — a rig is not news, and news is
  how it would leak.
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
- **What the jukebox is playing lives in `RealtimeDO`'s storage**, beside the event's key, and the
  greeting sends it — so a reload or a late join lands inside the record. It goes to EVERY socket on
  the unfiltered `fanout`, an anonymous one included, because the frame names no person and walking is
  public; `fanoutHeard` stays the one filtered fanout. The greeting frame is CONDITIONAL, sent only
  while a record is playing, unlike `event_changed`: silence is the common case and four assertions in
  the existing suite pin that greeting exactly (`index.test.ts`, `do/voice.test.ts` twice,
  `prizes.test.ts`), with `do/jukebox.test.ts` adding a fifth. **No alarm is ever set for a record**,
  for the reason the bullet above gives, so a stale state expires when it is READ, the way the voice
  channel frees itself by silence. **`publish` is what
  clears the record**, which is one rule covering the countdown, an abort, the landing and
  `POST /api/test/reset`; get that last one wrong and a record one e2e test left playing lights the
  cabinet for every later test on that shard. The presser's last-press time is DO storage under ONE key
  holding a time per presser, never broadcast, which is how a per-presser cooldown coexists with "the
  wire carries no identity"; `lib/rate-limit.ts` is not the tool, its own comment calling it a per-isolate
  window rather than an access control. Putting one on refuses OUTSIDE `submission`, with a reason, the way
  the clock route refuses; a stop is refused by nothing but that cooldown, because it can make no
  noise.
- `lib/gemini.ts` (REST) and `lib/npc.ts` (Workers AI) are not interchangeable. **Verify every model
  id against the provider's docs, never from memory.** `AVATAR_IMAGE_SIZE` is a PRICE. Gemini
  throws and callers decide differently on purpose; for the NPC, offline is a normal path.
- **An NPC's roster is `select name from users`, never `USERS_JSON`** — that var is a
  credential blob, and the prompt builder cannot leak a password it has no way to reach. NAMES only,
  and an unreadable world drops the names line and nothing else.
- **`NPC_MODELS` is one model PER CHARACTER, and the caps are too.** The neighbour gossips on the
  8B in one line; the guide answers off a briefing on `@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
  which is on the list Workers AI publishes as supporting JSON MODE — the mode BOTH are asked in,
  and a model that refuses it lands in the same catch a dead one does: asleep, every turn, with
  nothing in the logs to say why. `lib/trip.ts` is the whole
  of what the guide knows: the booklet cut to the schedule, the times and the things that go wrong
  without them, in Dutch because he answers in Dutch. He is told to answer from it and to say he
  will ask Katlyn rather than invent a pick-up time — an invented time is somebody standing in the
  wrong street at six in the morning. **His "vandaag" is today's date in Colombia and never the
  town's `game_state` day**, which the wheel moves for the photo game: 19-09-2026 is day 1, and a day
  past the last one says the trip is over rather than inventing a sixteenth.
- **`AI` is production-only, not by choice**: no local emulation, so declaring it in `local` stops
  `pnpm test:unit` and in `e2e` stops `pnpm dev:e2e`. `remote: false` does not help. **`IMAGES` is
  the opposite case and must not copy it**: miniflare simulates R2 in both the vitest pool and
  `wrangler dev`, so the bucket is declared in all three blocks.
- **`lib/images.ts` is the only module that touches the bucket.** Object BEFORE row, row BEFORE
  object-delete, so the only thing that can leak is an orphan. A missing object is a 404, never a
  500, and the console's describe REFUSES a row whose object has gone rather than reading an empty
  image. Nothing else in the console hands Gemini bytes: the jury reads descriptions.
- **Two Gemini keys, and the BILLED one goes first.** `juryKeys` (`lib/gemini.ts`) returns the keys
  a call may spend IN ORDER, off `SPEND_ORDER`, and every jury call — the upload's describe, the
  console's describe, the day's ranking, the bench — takes `GEMINI_API_KEY_PAID` and then
  `GEMINI_API_KEY`. It used to run the other way round, and what that cost was a day of photographs
  carrying nothing the jury could read: describing is one call per UPLOAD, fourteen to a day, and
  that burst is exactly what the free tier's PER-MINUTE cap refuses. The free key is kept BEHIND
  rather than dropped, because the only way to reach it is a 429 on the billed project, where a
  description on the free key beats none. A manual `billed` run is the second list and holds the
  billed key alone: what it drops is that FALLBACK, for the press made when the free key is known
  to be spent. `lib/avatar.ts` still hands
  `requestAvatar` the billed key ALONE, and the single-element list is the rule rather than a
  convention: a photograph drawn on the free key is the half of the split that stays, because the
  billed key going quiet is a player reading "offline" and not a bill. **Only a 429 moves down the
  list** — the free tier's cap is scoped to a Google PROJECT, so the billed key's own project is the
  one thing that answers it, where a 400 or a 503 would meet the second key exactly as the first.
  With only the billed key set the jury now uses it (it used to go dark). Both are still optional —
  with neither the jury scores 5 and the avatar machine answers "offline" — and every test helper
  pins BOTH variables, because the vitest pool reads a developer's `.env` and absence is never the
  default.
- **A failure STORES what Gemini said, never just that it failed** — `photo_descriptions.failure`
  and `day_rankings.failure`, both cleared by the next good run, both read straight off the console.
  `generateContent` is what makes them worth reading: Google's own body on a non-2xx (a 429 names
  the quota, a 400 the field), and the `finishReason`/`blockReason` where the call SUCCEEDED and
  answered nothing — the shapes a refusal arrives in, which is why every field of
  `geminiResponseSchema` is optional. Requiring `parts` turned a safety block, a spent quota and a
  truncated answer into one unreadable Zod issue. A missing key is its own sentence, because a
  config fault reads as a Gemini fault otherwise.
- **An upload DESCRIBES and only sometimes RANKS.** `describeThenRankFullDay` runs the ranking when
  `isDayFull` says every friend on the roster has handed one in — counted off `users`, `>=` so a
  town that shrank still finishes its days — and a swap on an already-full day counts, because the
  purge-and-insert leaves the count where it was and the FIELD is a different one to rank. Every
  other run is `POST /api/admin/days/:day/rank`. Ranking per upload is what the old code did and it
  was self-defeating: `claimRun` bumps a stamp each time and `rankDay` stops the moment a newer run
  claims one, so fourteen uploads meant thirteen runs that wrote nothing and one that had to
  succeed. Most of the worker suite therefore asks for its verdicts through `postRank`.
- **The jury never blocks an upload**: `waitUntil`, and a throw leaves the day's PREVIOUS verdicts
  exactly where they were rather than overwriting nine good ones with fives because the tenth
  upload's call timed out. `lib/photo-score.ts` ranks a WHOLE DAY (`rankDay`) — one text-only call
  over every described snap, keyed by `photos.id` in both directions — and the score IS the order:
  reals, distinct within the day, nothing storing a rank beside them. A response with a repeated
  score, a missing id or an id nobody sent is a PARSE FAILURE, because a tie is the one thing the
  scoring half cannot break.
  - **Newest run wins, by a per-day stamp in `day_rankings`.** Two uploads seconds apart race and
    there is no `alone()` outside `RealtimeDO`; comparing photo sets does not close it, because two
    runs over the SAME set are reachable and their two orders would interleave row by row. The stamp
    is claimed in one statement before the call and re-read before every row, so an overtaken run
    writes nothing further.
  - **The write is per row, never one `db.batch`**: `photo_scores.photo_id` is a real FK, so one
    snap retired mid-call would roll the whole day back. The dead row is skipped and the day stands.
    It UPSERTs, which is what makes a re-rank replace the day's verdicts rather than add a set.
  - **A keyless environment still produces rows**: the day-level fallback writes 5 with
    `ai_status = 'failed'` for every snap, because a missing verdict reads as "not ranked yet"
    forever and no Playwright environment has a key. Distinctness cannot hold across it — that is
    the unscored-field case `scoreDay` answers with the median position.
  - A snap with no `ok` description is left OUT of the batch rather than judged blind, and has no
    row at all: on the wire its `aiStatus` is `null`, the absence `scoreDay` already prices.
- **`lib/gemini.ts` makes THREE photograph calls and one that is not about a photograph at all** —
  the day's ranking reads descriptions and sends no image bytes, which is why `generateContent`
  takes PARTS rather than a required image. The second photograph call knows nothing:
  `requestDescription` is THEME-BLIND and JURY-BLIND — no jury, no theme, no persona, no score in its
  prompt — because `photo_descriptions_photo_idx` allows one row per photograph and nothing re-runs
  it when the jury or theme changes, so every later reader gets that same text. It judges
  photographs, so it reads `GEMINI_API_KEY` and never the billed key. The upload's ONE `waitUntil`
  chains the ranking BEHIND it, since the ranking reads the day's descriptions and starting it first
  would rank a day this snap is not yet in, on the days it ranks at all — but the upload still waits
  on neither; a failure stores
  a row that SAYS it failed (`lib/photo-description.ts`), since a missing one reads as "not described
  yet" forever. **A pass CLAIMS that row before it asks Gemini anything**, with
  `NEVER_CAME_BACK` on it: `waitUntil` can be torn down mid-call, and with nothing written first
  those snaps read "Not described" on the console — indistinguishable from a pass that never ran,
  which is exactly the silence an operator reported. The claim is `onConflictDoNothing`, never an
  upsert, and a FAILED outcome writes the status and the reason and LEAVES THE TEXT: the description
  is the only record of the photograph the jury sees, so a retry that broke must not cost the
  reading that worked, the same rule `rankDay` follows over a day's previous verdicts. The claim
  throwing is how a photograph that has GONE is told from one that is merely unread — `photo_id` is
  a real foreign key. The final write UPSERTs, so `POST /api/admin/photos/:id/describe` and the
  upload's first pass are one function, and the state reaches the console on `dayPhotosSchema`'s parallel `descriptions`
  array — never as a field on `photoSchema`, whose masking is the player's. **The description is the
  ONLY record of the photograph the jury ever sees**: a snap the describer never read is a snap the
  jury cannot rank.
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
  **`/api/avatars` pairs EVERY player with every key that name has ever drawn** — an empty `sprites`
  for whoever never has, because the crowds under the countdown and the title screen are the whole
  town, and a second route over the same rows is the sibling query jscpd fails on. The surface that
  only wants faces filters the empty players out. Wider than the presence roster, which pairs a name
  only with what somebody is wearing. A deliberate widening, behind the cookie, going ONE way:
  owner → their keys. There is still no route answering "whose sprite is this
  key?", which `/api/sprites/:key` refuses and must keep refusing. `pushSprite` broadcasts
  `avatar_changed` as well as the roster frame, because `presence_*` is not content news and the
  roster frame skips the socket that generated.
- **`commentRoutes(subject)` is ONE thread router mounted per subject**, under `/api/photos/:id` and
  `/api/avatars/:id` alike — a second router differing only in the noun is how the two would drift
  apart on who may delete what. The avatar mount sits above its listing to match the photos pair, not
  because it must: `townAvatarRoutes` declares only `/`, so nothing there could swallow it. Nothing
  on a sprite thread is anonymous: the gallery already prints the name beside every face.
- **`/api/prizes` keeps its own gate** — GET readable by any signed-in friend, mutations admin — and
  that asymmetry holds for BOTH sets: `?set=bowser` is the same router, the same rows and the same
  gate, so the Bowser list reads to a friend and 403s their every mutation. Bowser DAYS are the other
  lever and land under the `isAdmin` sub-router instead (`routes/admin-bowser.ts`), where reads are
  admin too.
- ONE `isAdmin` gate on the admin sub-router, not per handler — which is why the console's routers
  are mounted ON `adminRoutes` rather than in `index.ts`, where `adminEventRoutes` sits outside that
  gate and carries its own. What it serves is COUNTS, CONFIG and the operator's LEVERS — the clock,
  retirement, the bucket and the day's jury batch (`POST /api/admin/days/:day/rank`, whose state
  rides on `dayPhotosSchema` beside the descriptions) — plus, for RETIRED KEYS ONLY, bytes: a retired snap has no `photos` row
  left to serve it through, and it is the one object the console can render because
  `retired_photos` is the only thing still naming its content type. A true orphan is listed as a key
  and a size and never fetched, a live snap and a sprite keep their own routes, and no score or
  sprite is served here. The caps PATCH is the one config lever, a count is not, and neither it nor
  a re-rank broadcasts — no verdict reaches any client before its day is revealed, so there is
  nothing to invalidate; retirement broadcasts `photo_deleted` per snap AND pushes the state, because
  only `state_changed` carries the submission count. The bill is an ESTIMATE computed in the
  worker — Google reports no billing figures — so a price per image never crosses the wire.
  **Both manual jury routes take an optional `model` and an optional `spend`** (`juryRunSchema`,
  threaded through `describePhoto` and `rankDay` as one `JuryRun` rather than two parameters), and
  nothing else does: the upload's own describe has no operator behind it to choose either. The
  model is an ALLOWLIST in `shared/api.ts` (`JURY_MODELS`) rather than a free string, because what
  a browser sends there is a model name the worker pays Google to run; GA text-and-vision ids only,
  no preview (withdrawn without notice) and no `*-image` (answers with a picture, not the JSON both
  calls parse). `spend: "billed"` hands `juryKeys` a list of one. Since the billed
  key is already first for everything, the ONLY thing it changes is the fallback: a plain run may
  walk on to the free key when the billed project 429s, a billed one may not. There is no `free`
  option, because a run that refused to reach the billed key would be the failure this whole order
  exists to stop. The schema is `.nullish()` because a POST with no body is the
  common case and `parseJsonBody` answers null for it, and both routes refuse an unknown override
  with the one `REFUSED_RUN` line. `worker/lib/gemini.test.ts` holds `GEMINI_MODEL` and the list
  together.
  **`POST /api/admin/bench` is the one exception to all of it**: the only Gemini call in the app
  with no snap behind it. It scores a picked image against a jury picked BY INDEX out of `JURIES`
  and stores NOTHING — no `photos` row, no `photo_scores` row, nothing counted, nothing
  broadcast — so a bench press cannot touch a day and appears in no estimate. It spends `juryKeys` like
  every other jury call, answers a readable "offline" with no key at all, and sits behind
  `rateLimiter` because a billed multimodal call with a
  button in front of it is a button somebody holds down.
- `/api/test/*` 404s outside local/e2e, failing closed on an unknown `ENVIRONMENT`. Each route
  exists because its state is otherwise unreachable; `reset` winds the stored event AND its pending
  alarm back, or the next test opens inside the last one's event.
- `broadcast` is best-effort and never fails a mutation. Anything moving the clock also calls
  `pushGameState`. `/state` only remembers, so `/api/ws` can warm a cold DO without re-notifying
  everyone already in sync.
