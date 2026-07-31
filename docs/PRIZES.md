# Prize wheel

Prizes are admin-managed rows in the `prizes` table, not hardcoded, and are **not consumed** — the
same one can be won on multiple days. `shared/prizes.ts` holds the seed labels admins are expected to
edit, and `MIN_ENABLED_PRIZES`.

- Only **enabled** prizes are segments, and the set is **snapshotted when the phase opens**, so an
  admin editing the list mid-event cannot desync it.
- The landing index is chosen server-side (`crypto.getRandomValues` in `RealtimeDO`) and broadcast;
  clients animate to it and never decide the result.
- Below `MIN_ENABLED_PRIZES` the wheel cannot spin and START refuses with the reason.
