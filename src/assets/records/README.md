# The jukebox's shelf

Drop an audio file in here named `Artist - Song title.<ext>` and redeploy: Vite's build-time
glob is what enumerates this directory, so there is no script to run and no route to add. The
separator is a hyphen with a space on each side, and it is load-bearing: the filename is all
the shelf knows, and the stem is the track's id.

`Test Pattern - Tone For Fourteen Friends.wav` is the fixture `e2e/jukebox.spec.ts` plays.
Leave it here: with it gone the suite has no real file to put on. It is deliberately larger
than Vite's 4096-byte `assetsInlineLimit`, so it is served at a hashed URL like a real record
rather than inlined as a data URL.

These bytes are PUBLIC — served off the SPA, at a cacheable unauthenticated URL, out of a
public git history. See the root `CLAUDE.md` for why that is accepted here and nowhere else.
