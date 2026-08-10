# src/

- **Dismissing the splash is the app's guaranteed user gesture, so that is where the AudioContext is
  created.** It is skipped outside `submission`, so nobody presses START to enter a running event —
  and such a screen hears none of the event's cues UNTIL somebody holds the push-to-talk bar, which
  is a guaranteed gesture of its own and calls `unlockAudio` (a no-op once a context exists). A
  screen that never holds it has no context and so hears no voice either — the honest limit, which
  the bar's own accessible name states rather than leaving silent.
- START is a round trip to the splash and nothing else: not the session, not the tile, not the clock.
- A live event covers the map and takes the buttons, with TWO per-player exceptions: **Done** on the
  wheel's last page unfreezes walking for that screen, and the **push-to-talk bar** is live
  throughout — it sits outside the LCD the overlay covers, and touches no phase, route or clock.
  Safe, because uploading and voting are `submission`-only and both routes 409 anyway.
  `EventOverlay` renders BEFORE the dialogue box so the SELECT menu still opens on top —
  **Abort event** lives there, and so does **Spin the wheel**, offered to the frozen host of an
  unspun wheel as the way past a winner who never presses.
- `interactableAt` + `OPENS` (a total `Record`) are why a seventh interactable cannot exist without
  deciding what walking up to it does.
- `useFilePicker` is the ONE picker primitive: `open()` must be called inside the real press, or
  Safari refuses (a deferred `click()` loses the gesture), and it is a plain hidden
  `<input type="file">` because Playwright cannot drive `showOpenFilePicker`. **Picking a photograph
  IS the generation** — no preview, no form. A cancelled picker fires no `change`, so nothing is
  invented for it.
- `[Replace photo]` confirms because it purges; `[Upload photo]` has nothing to destroy.
  `[Draw me]` refuses at the CHOICE when the quota or cooldown is spent — a picker opening onto a
  certain 429 is a worse conversation than a no, and that refusal is the ONLY place a spent quota is
  felt: **no surface here prints a remaining-generations number**, because what the town may spend is
  a money decision and belongs on the admin's screen (#112).
- **Cancel is always the FIRST choice of `confirmChain`**, so A-ing through a question cannot end a
  session, destroy a snap or drop fourteen screens into a countdown.
- A dialogue chain carries an **`id`** and restarts only when that changes — never on object
  identity, or a menu label reading its own state back throws the cursor home.
- **The SELECT menu is a registry** (`game/menu.ts`): an id without a handler is a type error. An
  admin item is hidden by the registry AND refused by the route; the registry is never the
  enforcement. SELECT is `c`, not Shift, which fires its own keydown while somebody types a capital
  `W` that `KEY_DIRS` reads as walking.
- **ONE modal layer, the browser's own** (`components/Modal.tsx`): a native `<dialog>` +
  `showModal()`, so stacking and inertness are the platform's. It replaced two `z-50` scrims and a
  pair of `window` Escape listeners that closed both windows at once. Never add a scrim or a
  z-index.
- `useCachedFetch`'s two waits differ: `loading` is the FIRST fetch only, `busy` is ANY fetch — which
  is what makes a post-mutation `mutate()` visible at all. A value learned twice (fetched, then
  pushed) goes through `useLiveValue`, whose `select` must be module-level, not an inline closure.
- **A generated sprite is made walkable in the BROWSER, at draw time** — Workers have no canvas, and
  a JS PNG decoder in the Worker is not worth it. `keyOutBackground` floods FROM THE EDGES so only
  white CONNECTED to the border goes, and a subject in a white shirt keeps it. Positions are a REF
  (six frames a second, not six re-renders); the remote sprite cache is module-level because the rAF
  loop cannot await.
- `footstepCue` is a total `Record<WalkableTile, CueName>`, so a new walkable tile is a type error
  until it has a sound. TWO gait counters, local and remote, or a friend's steps make your own walk
  stutter. `remoteStep` is silent for the roster frame, a first sighting, and the keep-alive repeat —
  which would give every idle friend a phantom footstep — and is asked BEFORE the roster moves on,
  because the tile somebody came from is the only thing that can answer it.
- `unlockAudio` remembers its `resume()` promise and `playCue` awaits it: Safari resolves a tick late
  and would swallow the first cue. **Never fix that with a timeout at a call site.** Voice waits on
  the same `whenLive` and borrows the same context — iOS caps them and two would fight over the
  audio session.
- **The shoulder bar's band is structural, not a coordinate.** `.gb-bezel-inner` is
  `align-items: center`, so the bar and the HOLD TO SPEAK row are both centred on the LCD; the
  battery column is a `1fr auto 1fr` grid precisely so the middle row lands there, and `--gb-band-h`
  is only how thick that band is. The bar escapes the shell on cancelling margins, and the shell
  clips with `overflow: clip` + `overflow-clip-margin` so its four radii still trim everything else.
- `SayBox` is a `Dialog` precisely so the shell stops handing out the D-pad and A while somebody
  types (`KEY_DIRS` reads W/A/S/D). Speech is fanned out and FORGOTTEN — no history, nothing to
  replay to a late join.
- Canvas text goes through the one pixel font; anything it cannot draw is a blank, so player text is
  folded through `sayable` first.
- **Nothing under `src/` counts anything down.** `useNow` only re-reads the clock; nothing here may
  tick a phase along or advance one it is rendering.
- The ballot has **no confirm and no Save button** — every tap is one tap from undone, debounce-saved
  through the idempotent PUT, and the readout reads the route's refusal rather than swallowing it.
  `tapRank` is the only rank decision and always returns a contiguous 1..n.
- `lib/rating.ts` is the ONE place the jury's rating is worded: every surface printing it reads it
  from there, and independently written "AI n/10" strings are how it drifted (#97). `useChampion`
  reads the same results query the archive and reveal read, so the plinth cannot disagree with the
  scoreboard.
- **`SnapViewer` is the ONE big-photograph shell**, the ballot's and the archive's; each surface only
  fills its slots. Paging is ‹ › buttons, ←/→ keys and two tap zones over the picture, all through
  one `step`, so a change to it cannot land on one surface only. The zones' accessible names must NOT
  contain "Previous snap"/"Next snap": `getByRole`'s `name` matches a substring, and `voting.spec.ts`
  and `archive.spec.ts` resolve those names page-wide, so a second button saying either is a
  strict-mode violation in every one of those assertions. The open snap is
  resolved out of the LIST by id on every render (`lib/viewer.ts`) — a stored index becomes a
  different photograph the moment the feed refetches. `SnapDialog` is the small one-snap window for
  every caller that has an id and no list to page through.
- **A viewer asks to delete; the shell deletes** (#93). `confirmChain` lives in the LCD's dialogue
  box, which the modal layer covers, so the question cannot be asked while the viewer is on screen:
  `confirm-delete` carries the id and where to put a cancelling reader back.
- **`AvatarGallery` is the ONE sprite shelf** and `CommentThread` the ONE thread: the artist's
  wardrobe asks the gallery for `mineOnly`, the archive's Avatars tab for everyone, and both wear
  through the same route — a second grid is how one place would offer a player faces the other did
  not. The gallery calls `onWorn` because `useMyAvatar` listens to no socket event: `avatar_changed`
  reaches the wearer's own tab and refreshes nothing, so their corner and walking sprite move only
  when something asks for them.
- `SAY_MY_OWN` is always the LAST neighbour option: the free-text path is demoted, not deleted.
- **The archive is deliberately not a Game Boy** (#99). Every class is prefixed `arc-` and used
  nowhere else, so the modern look is quarantined by naming — with ONE crossing, the artist's
  wardrobe, which is `AvatarGallery` inside a `.gb-window`. Sharing the one shelf is what keeps a
  player from being offered different faces in the two places, and jscpd refuses the copy that would
  avoid it; the `arc-` classes come along with it.
- **`cqw` is 1% of the SHELL, never of the LCD** (`container-type` sits on `.gb-shell`), and the
  frame the badges are offset against pads the canvas with bezel — so a fraction of the screen is
  `--gb-face`, not `30cqw` and not a bare percentage. Your own avatar takes the top-left corner
  while the SELECT menu is open and the theme badge steps aside for it: three tiles BELOW the theme
  reach into the bottom slot, where an admin's menu already reaches.
- `SEGMENT_CQW`/`WHEEL_CQW` are duplicated into CSS on purpose because the ribbon is positioned in
  code: **move one and the other moves with it, or the wheel lands on the wrong segment.** Hence
  `.gb-wheel`'s `flex: none` — shrunk to fit, the marker left the centre of segment zero.
- `beforeinstallprompt` is captured at startup because it fires long before anyone opens the menu;
  browsers that never fire it (always iOS) fall back to instructions, so **Install app** is never
  dead.
- `WebSocketProvider` waits for `/api/me` and reconnects on user-id change: identity is fixed at
  UPGRADE time, so signing in through the menu — which reloads nothing — must mean a new socket.
- `IMAGE_ACCEPT` mirrors the worker's allowlist so a picker cannot offer what the route refuses.
- App icons are generated from ONE 32x32 grid in `scripts/icons.mjs`; run it and commit the PNGs,
  because nothing in the build regenerates them.
