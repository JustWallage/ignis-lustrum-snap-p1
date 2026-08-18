# The jukebox's shelf

Drop an audio file in here named `Artist - Song title.<ext>` and redeploy: Vite's build-time
glob is what enumerates this directory, so there is no script to run and no route to add. The
separator is a hyphen with a space on each side, and it is load-bearing: the filename is all
the shelf knows, and the stem is the track's id.

The three `Test Pattern` tones are what `e2e/jukebox.spec.ts` plays. Leave them here, all
three: with them gone the suite has no real file to put on, and the selector needs at least
three records before it has a neighbouring sleeve to flick to. `A Tone For Fourteen Friends`
runs ten seconds because a spec has to watch the cabinet while it is still lit; the other two
are a second each. Each is deliberately larger than Vite's 4096-byte `assetsInlineLimit`, so
they are served at hashed URLs like real records rather than inlined as data URLs.

These bytes are PUBLIC — served off the SPA, at a cacheable unauthenticated URL, out of a
public git history. See the root `CLAUDE.md` for why that is accepted here and nowhere else.
