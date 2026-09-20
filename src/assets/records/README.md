# The jukebox's shelf

Drop an audio file in here named `Artist - Song title.<ext>` and redeploy: Vite's build-time
glob is what enumerates this directory, so there is no script to run and no route to add. The
separator is a hyphen with a space on each side, and it is load-bearing: the filename is all
the shelf knows, and the stem is the track's id. It splits on the FIRST separator, so an
artist may not contain one. A stem with no separator anywhere is a record with no artist —
the marquee prints the title alone and keeps the blank line, which is what the four lustrum
records below are.

The glob in `src/lib/shelf.ts` accepts `mp3`, `ogg`, `oga`, `m4a`, `aac`, `flac`, `wav` and
`webm`, and a file with any other extension is simply not on the shelf — widen that list to
add one.

The shelf is NOT sorted by id alone: `LEAD` in `src/lib/shelf.ts` names the ids that come
first and in what order, and everything it does not name follows sorted by id. A record
whose id is not in that list is filed behind the ones that are, however early it sorts.

`e2e/jukebox.spec.ts` presses whatever the selector faces first, which is `LEAD`'s first
entry, so reordering that list is what changes the record those presses play — harmless
only while every record on the shelf outlasts the assertion that the cabinet is lit, which
rules out a shelf of short tones. It names one record by id, in the press it drives at the
route while an event is live; keep that id on the shelf or rename it there too.

The four `Het Zangcorps` records came off `rp.clubignis.nl` (Radio Phoenix), which files them
under `Wageningen` in a `JC Club Ignis` folder. That folder is not in the filename, and the
source spells the entries the other way round — `Panama! - Het Zangcorps` — so a copy taken
straight off it files four records under four different artists named after the songs. They
are flipped by hand on the way in.

They arrive as 44.1 kHz PCM at 26-47 MB each and are encoded at 192 rather than the 128 the
rest of that source is mastered at: these are pristine, and 18 MB of the shelf's ~59 MB
either way. Cover art is stripped — nothing reads it.

`Het Goede Doel - België` is a straight copy of the file the sibling `iglympics` repo plays
out of its own `public/music/`, byte for byte. Only the name changed: that repo spells the
title `Belgie`, and the stem is what the cabinet PRINTS, so the diacritic goes back on here.
The two repos therefore disagree about the filename on purpose.

The four unattributed records — `Haal Een Pilsje Voor Mij`, `Colombia Mia`, `Colombia` and
`Vorig Lustrum` — came off the lustrum CD as bare titles, with an ID3 year and nothing else:
no artist tag, and none in the filenames they arrived under. So they are filed WITHOUT one
rather than under a guess, because the stem is what the cabinet prints and a wrong artist is
printed as confidently as a right one. They are 320 kbps, which is why they are the heaviest
files here.

These bytes are PUBLIC — served off the SPA, at a cacheable unauthenticated URL, out of a
public git history. See the root `CLAUDE.md` for why that is accepted here and nowhere else.
