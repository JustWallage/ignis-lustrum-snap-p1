# Prize wheel

Prizes are admin-managed rows in the `prizes` table, not hardcoded, and are **not consumed** — the
same one can be won on multiple days. `shared/prizes.ts` holds the seed labels admins are expected to
edit, and `MIN_ENABLED_PRIZES`.

There are **TWO SETS of those rows, not two wheels**: `prizes.prize_set` is `ordinary` or `bowser`,
and one router, one editor and one ordering serve both. Which set a day uses is decided by
`bowser_days` — a marked day comes back with the Bowser set, everything else with the ordinary one.

- Only **enabled** prizes are segments, and the set is **snapshotted when the phase opens**, so an
  admin editing the list mid-event cannot desync it.
- The landing index is chosen server-side (`crypto.getRandomValues` in `RealtimeDO`) and broadcast;
  clients animate to it and never decide the result.
- Below `MIN_ENABLED_PRIZES` the wheel cannot spin and START refuses with the reason — checking **the
  set the day will actually use**, and naming which one is short.
- **`GET /api/prizes` is the ordinary set** — for an absent, empty or unreadable `?set=`, so its
  existing callers read the wheel they always did. Only `?set=bowser` answers the other one.
- **The Bowser set ships EMPTY**: no second seed constant and no second copy of the labels in SQL to
  hold together. An operator fills it in the console, and a marked day whose list is short refuses at
  START.
