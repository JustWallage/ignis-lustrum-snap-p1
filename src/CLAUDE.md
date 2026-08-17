# src/

- **Dismissing the splash is the app's guaranteed user gesture, so that is where the AudioContext is
  created.** It is skipped outside `submission`, so nobody presses START to enter a running event —
  and such a screen hears none of the event's cues UNTIL somebody holds the push-to-talk grille,
  which is a guaranteed gesture of its own and calls `unlockAudio` (a no-op once a context exists). A
  screen that never holds it has no context and so hears no voice either — the honest limit, which
  the button's own accessible name states rather than leaving silent.
- START is a round trip to the splash and nothing else: not the session, not the tile, not the clock.
- A live event covers the map and takes the buttons, with TWO per-player exceptions: **leaving the
  last page** unfreezes walking for that screen — **Done** onto the map, **View results** into the
  archive, which needs no day threaded to it because it already opens on the newest revealed one —
  and the **push-to-talk grille** is live throughout, since it sits on the face below the LCD the
  overlay covers and touches no phase, route or clock.
  Safe, because uploading and voting are `submission`-only and both routes 409 anyway.
  `EventOverlay` renders BEFORE the dialogue box so the SELECT menu still opens on top —
  **Abort event** lives there, and so does **Spin the wheel**, offered to the frozen host of an
  unspun wheel as the way past a winner who never presses.
- **`SURVIVES_EVENT` decides what an event may leave open**, a total `Record` over `Dialog["kind"]`
  so a new kind cannot exist without the decision. Every transition (`eventStageKey`) closes what it
  says no, and `dialog` is DERIVED through it, so a box that outlived one is invisible and inert
  rather than painted over the opaque overlay — an NPC conversation open when the countdown lands
  used to run on under it and, because SELECT is dead while a dialog is up, took Abort event away
  from the host. What the menu raises must say yes: the host's confirmation is that same box.
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
- **The crowd is drawn TWICE because there are two canvases, not one.** `game/crowd.ts` is the only
  arrangement — a count and a seed in, back-to-front places out — and both surfaces read it: the
  title screen paints it onto the LCD inside `drawSplash`, the event overlay stands one `<canvas>`
  per character with the place written in as inline geometry. **The overlay cannot use the LCD**:
  `.gb-event` is opaque and covers it. An `<img>` cannot be used either — a sprite is keyed out in
  the BROWSER, so `/api/sprites/:key` serves the portrait on its white ground. The splash's crowd is
  arranged per SHOWING and held in a ref, because `drawSplash` runs every frame and a crowd shuffled
  inside it is a strobe. Nobody stands beside a parade snap: photographs are anonymous until their
  day is out.
- `footstepCue` is a total `Record<WalkableTile, CueName>`, so a new walkable tile is a type error
  until it has a sound. TWO gait counters, local and remote, or a friend's steps make your own walk
  stutter. `remoteStep` is silent for the roster frame, a first sighting, and the keep-alive repeat —
  which would give every idle friend a phantom footstep — and is asked BEFORE the roster moves on,
  because the tile somebody came from is the only thing that can answer it.
- `unlockAudio` remembers its `resume()` promise and `playCue` awaits it: Safari resolves a tick late
  and would swallow the first cue. **Never fix that with a timeout at a call site.** Voice waits on
  the same `whenLive` and borrows the same context — iOS caps them and two would fight over the
  audio session.
- **The push-to-talk button IS the speaker grille**, and what holds it at the foot of the face is
  `.gb-bottom`'s `auto` TOP MARGIN, not its `align-items: flex-end` — the stack is the tallest thing
  in that row, so it has no free cross space and `flex-end` only ever aligns the pills. The button
  being the stack's LAST child is the other half: HOLD TO SPEAK and OTHERS SPEAKING grow UPWARDS
  into slack the auto margin gives back instead of pushing it down. The stack is a FIXED width
  because a speaker's name arrives at runtime and, sized by its text, it would resize the button
  under the thumb holding it; each label is one clipped line so a wrap cannot grow those rows up
  into the A/B buttons. Its bottom-right corner is rounded CONCENTRICALLY with the shell's foot —
  `--gb-foot` less the gap `.gb-bottom` keeps, which is why that gap is an equal 7cqw on both sides
  — so the two curves run parallel rather than one into the other. Nothing escapes the shell's
  silhouette, so `overflow: clip` trims for the four radii alone.
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
- `lib/rating.ts` is the ONE place the jury's rating is worded, the operator's console included:
  every surface printing it reads it from there, independently written "AI n/10" strings are how it
  drifted (#97), and it is also the only thing that ROUNDS — the stored score carries decimals
  because it is the day's order, so two snaps reading `8/10` are not a tie underneath. `useChampion`
  reads the same results query the archive and reveal read, so the plinth cannot disagree with the
  scoreboard. **The jury's critique IS the photograph's title** — there is no gallery label beside
  it — so the card, the open photograph and the podium all print that one field and none of them
  decides between two.
- **A peer figure is green and a jury figure blue, everywhere either prints** — `.ink-peer` /
  `.ink-jury` over `--ink-peer` / `--ink-jury`, whose value is per BACKGROUND (the event's dark
  screen, then every light surface) because no single green clears both `#202830` and `#fff`. The
  classes belong to neither idiom on purpose: a `gb-` class in the archive, or an `arc-` one in the
  event, breaks the quarantine above. **The total, the bonus, the no-ballot penalty and the rank are
  neither half** and stay untinted; a failure note is jury-side text and takes the blue. Colour only
  repeats what the words already say, so a figure keeps naming its half whatever it is tinted.
  The console's bench panel is the exception — no day, no peer half on screen, so a blue there would
  code for a distinction that screen does not make.
- **`SnapViewer` is the ONE big-photograph shell**, the ballot's and the archive's; each surface only
  fills its slots. Paging is ‹ › buttons, ←/→ keys and two tap zones over the picture, all through
  one `step`, so a change to it cannot land on one surface only. The zones' accessible names must NOT
  contain "Previous snap"/"Next snap": `getByRole`'s `name` matches a substring, and `voting.spec.ts`
  and `archive.spec.ts` resolve those names page-wide, so a second button saying either is a
  strict-mode violation in every one of those assertions. The open snap is
  resolved out of the LIST by id on every render (`lib/viewer.ts`) — a stored index becomes a
  different photograph the moment the feed refetches. `SnapDialog` is the small one-snap window for
  every caller that has an id and no list to page through.
- **The picture carries a zoom of its own and the zones share their surface with it** (#41): a tap
  therefore WAITS OUT the double-tap window before it pages, and a second tap inside that window
  cancels the page and zooms instead — a double-tap that paged twice on its way to zooming is not a
  double-tap. The ‹ › buttons and the arrow keys are not taps and still step at once. A finger that
  travelled past the slop is a drag, not a tap, and the click ending it pages nothing. The geometry
  is `lib/zoom.ts` and nothing else: pinch, double-tap and drag all land in the one `Zoom`, which
  answers `FIT` for any scale at or below fit — below 1 the clamp's own limit goes NEGATIVE and pins
  the picture off centre at a sub-fit size, so an overshooting pinch is caught before it is clamped.
  Zoom is reset by the OPEN SNAP changing, so a page turn cannot hand the next reader a
  magnified corner of a photograph they have not seen.
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
- **The operator's console is the second one** (#29), quarantined the same way under `ops-`, and it
  crosses nowhere: it is a PAGE, not a window, so it is not inside `.gb-stage` at all — `App` branches
  on `location.pathname` and mounts `AuthProvider` and nothing else. No `WebSocketProvider`, because
  a socket rendering no `Overworld` announces no position and carries nothing: every panel is a
  `useCachedFetch` refetching after its own mutations, and `useGameState`, `useLiveValue` and
  `useRealtimeEvents` all throw here. Nothing on it opens `Modal.tsx` and no panel is a small centred
  window — a destructive button becomes a Cancel-and-confirm pair WHERE IT STANDS (`ConfirmButton`),
  cancel first for the same reason `confirmChain` puts it first. The three panels rewritten out of
  the SELECT menu are rewritten, not moved: `GbWindow`, `GbButton` and `gb-input` stay behind with
  their other callers. No COMPONENT crosses; the hooks and `lib/` helpers do — `useFilePicker`
  because it is the one picker primitive, and `ratingText` because `lib/rating.ts` is the one place
  the jury's rating is worded.
- **`cqw` is 1% of the SHELL, never of the LCD** (`container-type` sits on `.gb-shell`), and the
  frame the badges are offset against pads the canvas with bezel — so a fraction of the screen is
  `--gb-face`, not `30cqw` and not a bare percentage. Your own avatar takes the top-left corner
  while the SELECT menu is open and the theme badge steps aside for it: three tiles BELOW the theme
  reach into the bottom slot, where an admin's menu already reaches. **In `.gb-shell`'s OWN rule
  `cqw` is not that unit at all**: an element is a query container for its descendants, not for
  itself, so with no ancestor container those values resolve against the VIEWPORT. The silhouette
  measures itself in `--gb-pc` — one percent of its own width — because `14cqw` there was 14vw, and
  on any short, wide viewport, where `98dvh` and not `96vw` decides the height, that foot grew to a
  third of the shell and swallowed the grille's corner.
- **Double-tap zoom is killed on `.gb-stage` plus a descendant selector** — the
  value is not inherited, so the descendant half is what puts it on each surface itself, dialogs
  included: they are the stage's DOM children however the top layer paints them, and nothing new has
  to remember to opt in. The console is the one surface that rule cannot reach, being a PAGE outside
  the stage, and carries the same pair under `.ops-screen` (#41) — the second copy is the whole net,
  so a third surface outside `.gb-stage` needs its own. The value is `manipulation`, never `none`
  (which stops the feeds, rails and comment lists scrolling), and **`user-scalable=no` is out**: the
  archive exists to be read. **`maximum-scale=1` on the viewport meta is the other half**, and the
  only thing that stops iOS Safari zooming a focused field under 16px — no `touch-action` value
  does, which is why the three fields are still sized as they are rather than bumped to 16px. It is
  also why the photograph carries a zoom of its OWN: iOS ignores the meta for pinch as an
  accessibility guarantee, Android honours it, and shipping the meta alone locks the archive's
  pictures at one size on every Android in the town. The DESCENDANT half is
  wrapped in `:where()` — `.gb-stage` itself is bare, since nothing competes on it — so a control's
  own `touch-action: none` (D-pad, A/B, pill caps, the grille, and `.gb-viewer-frame`, which takes
  it precisely because `SnapViewer` runs the gesture itself) wins wherever it is declared rather
  than only by sitting later, and the effective value being the intersection down the chain is what
  keeps a thumb on those from panning the page.
- **The prize drum's geometry is `lib/wheel.ts` and nothing else**: a face is placed by an ANGLE,
  which CSS cannot compute, so `WheelScreen` writes the window, the perspective, every face and the
  marker's frame in as it renders and the stylesheet holds no copy to go stale — bar the shading
  gradient's stops, which are pinned to where the radius puts the horizon. **The marker frames
  the near face MAGNIFIED by the perspective**, never a face's own height — that is the copy that
  went false first. `.gb-wheel`'s `overflow: hidden` is why the `preserve-3d` wrapper sits INSIDE
  it (any overflow but `visible` forces the used `transform-style` of that same element to flat, so
  `preserve-3d` on `.gb-wheel` is ignored), and why the
  barrel is built narrower than its window: Chromium cuts a face against that clip in the face's
  own plane, which projects to a diagonal wedge across it. `flex: none` for the same window —
  shorter than the barrel, it crops the edges the roll is read from. **A Bowser day's drum is a
  VARIANT of that one drum** — `data-bowser` on `.gb-wheel` and four custom properties, never a
  second drum and never a second geometry — and the beast that comes on before it is `BeastScreen`,
  the first beat of the `wheel` phase rather than a fourth reveal page. It places itself from
  `beastEndsAt` and the clock, like everything else on this screen, so a screen joining mid-beast
  lands inside it; `PixelSprite` is the ONE canvas figure of the overlay and the beast comes through
  it beside the character it eats.
- `beforeinstallprompt` is captured at startup because it fires long before anyone opens the menu;
  browsers that never fire it (always iOS) fall back to instructions, so **Install app** is never
  dead.
- `WebSocketProvider` waits for `/api/me` and reconnects on user-id change: identity is fixed at
  UPGRADE time, so signing in through the menu — which reloads nothing — must mean a new socket.
- `IMAGE_ACCEPT` mirrors the worker's allowlist so a picker cannot offer what the route refuses.
- App icons are generated from ONE 32x32 grid in `scripts/icons.mjs`; run it and commit the PNGs,
  because nothing in the build regenerates them.
