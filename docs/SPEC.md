# Product intent

Why the design is what it is. The running system is described by the `CLAUDE.md` files; this does not
repeat them, and where a ticket disagrees with it, this wins and the ticket gets fixed.

A 14-day photo contest played on a Game Boy. There is no end: after day 14 the jury schedule wraps and
play continues.

- **Both halves of the score are a POSITION in the day's field**, which is the only way peer votes and
  an AI score carry equal weight. Normalising against a theoretical maximum leaves the AI dominating
  in practice, and normalising against the day's best value leaves a snap nobody voted for on nothing
  however good it was — a position keeps it in the game and lets the jury's favourite win the day.
- **Photos are anonymous until their day is revealed** — that is the game, not a privacy feature. The
  counterpart is that walking is public: an anonymous visitor sees the town and everybody in it.
- **Players pass straight through each other**, so nobody can body-block the door or the jury. Names
  are painted over the sprites, because a shared town where you cannot tell which friend walked past is
  scenery rather than company.
- **One image-in → image-out call for avatars**, not trait-extraction into a separate image model:
  cheaper and a much better likeness. It never refuses — a non-human subject gets personified.
- **The avatar caps are about money.** The image model charges per picture: the personal cap stops one
  player sitting on the button, the shared one stops fourteen polite players adding up to a surprise.
- **A jury failure never blocks an upload.** The alternative is a player whose photo will not go in
  because a third party is down.
- **The event runs itself** — no phase but the wheel waits for anybody to press anything. The one
  thing an operator may decide in advance is which prize a given day's wheel lands on: it is set per
  day in the console, it changes nothing a player sees or hears, and a day nobody rigged still rolls.
- **The reveal parades worst-first**, so the last snap shown is the winner's.
- **Below `MIN_ENABLED_PRIZES` the START button refuses**, with the reason: an event that could not be
  finished is worse than one that never began, and the admin is standing right there to be told. Three
  phases later, on an alarm, there is no request left to answer.
- **Game Boy Color screen, DMG shell.** Per-tile 4-colour ramps over the existing DMG art is how the
  real hardware colourised DMG games, and far smaller than repainting every sprite. **The ramps do
  not move with the day** — the town is the thing fourteen people recognise, and a jury-wide tint
  made it blander rather than richer. **The day's jury DECORATES it instead**: Christmas conifers
  and a wreath on the door, a treeline on fire, blossom and bunting, a sailboat on the pond. The
  props hang on what is already solid, so a themed day changes what the town looks like and nothing
  about how it is walked.
- **Sound is synthesised, no assets** — the channels the hardware had. Footsteps are per surface,
  because the ground telling you what it is made of is most of what makes a town feel walked in.
  The squelch around a transmission is two more of those, and mute is for them and not for voice: a
  muted player still hears their friends.
- **The voice channel is a walkie-talkie, not a phone.** Fourteen friends can pass each other forty
  characters at a time; holding the speaker grille is how you say the rest. Half-duplex on purpose —
  one speaker at a time is what makes a chunk of samples need no header, and what stops fourteen
  open microphones from being the feature. **Nothing about a transmission is stored**: it is relayed
  and dropped, like `SayBox` speech, so there is no history, no replay to a late join and nothing to
  delete.
- **The archive is deliberately not a Game Boy** (#99): legibility beat consistency, for the one
  screen whose job is reading. It has now happened twice — **the operator's console** (#29) is the
  other, a full-screen modern surface at `/admin` for running the game rather than playing it: the
  clock, snap retirement, a view of the bucket and the four levers that used to be in the SELECT
  menu. Two surfaces, each quarantined by its own class prefix. The Game Boy is the game again.
- **Retiring a snap keeps the photograph.** Taking one out of play deletes the row that names it and
  leaves the bytes in the bucket, which is why there is no delete-forever button anywhere on the
  console: the point of retiring is that the picture is the backup. It frees the player's slot for
  that day, so they can hand in another one.
- **Image bytes belong in a bucket, not in the database.** They were base64 in D1 only because the
  documentation said the CI token could not reach R2, and it could; the row keeps the name, the bucket
  keeps the picture. What does NOT change is who may look: the Worker serves every byte behind the
  cookie, and no bucket is public and no URL escapes the auth boundary — walking is public, content is
  not, and an anonymous socket already knows every walking player's sprite URL.

Out of scope: **web push** (#32 — two tickets of VAPID plumbing, and on iOS only once installed).
