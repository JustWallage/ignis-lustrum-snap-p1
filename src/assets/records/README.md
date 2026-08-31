# The jukebox's shelf

Drop an audio file in here named `Artist - Song title.<ext>` and redeploy: Vite's build-time
glob is what enumerates this directory, so there is no script to run and no route to add. The
separator is a hyphen with a space on each side, and it is load-bearing: the filename is all
the shelf knows, and the stem is the track's id. It splits on the FIRST separator, so an
artist may not contain one.

The glob in `src/lib/shelf.ts` accepts `mp3`, `ogg`, `oga`, `m4a`, `aac`, `flac`, `wav` and
`webm`, and a file with any other extension is simply not on the shelf — widen that list to
add one.

Leave the three `Test Pattern` tones here, all three: `e2e/jukebox.spec.ts` names
`Test Pattern - Bleep` by id, and the suite must not go red the day somebody prunes the
shelf. Each is deliberately larger than Vite's 4096-byte `assetsInlineLimit`, so they are
served at hashed URLs like real records rather than inlined as data URLs. Most of the spec's
presses do NOT name a record: they play whatever the selector faces first, which is the shelf
sorted by id, so adding a record that sorts above the current first one changes what they
play — harmless while every record outlasts the assertion that the cabinet is lit. The
cooldown test flicks to `Bleep` first, because a press has to read the faced record's
duration off the file and on a real record that read can outlast the cooldown it asserts.

The four `Het Zangcorps` records came off `rp.clubignis.nl` (Radio Phoenix), which files them
under `Wageningen` in a `JC Club Ignis` folder. That folder is not in the filename, and the
source spells the entries the other way round — `Panama! - Het Zangcorps` — so a copy taken
straight off it files four records under four different artists named after the songs. They
are flipped by hand on the way in.

They arrive as 44.1 kHz PCM at 26-47 MB each and are encoded at 192 rather than the 128 the
rest of that source is mastered at: these are pristine, and the whole shelf is 17 MB either
way. Cover art is stripped — nothing reads it.

These bytes are PUBLIC — served off the SPA, at a cacheable unauthenticated URL, out of a
public git history. See the root `CLAUDE.md` for why that is accepted here and nowhere else.
