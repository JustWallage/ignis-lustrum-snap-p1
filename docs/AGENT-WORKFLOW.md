# Agent workflow

GitHub Issues is the source of truth. **The lock is a heartbeat comment, not the assignee** — every
agent signs in as the same login, so the assignee cannot say _which_ agent holds a ticket.

Runner A has `gh`; Runner B (Claude Code web) does not and drives GitHub through the GitHub MCP
tools instead. Check with `node scripts/ticket.mjs ready`. **Never invent a third path** — no `gh`
shim, no curling `api.github.com` with `GH_TOKEN`, which is a proxy credential there and 401s.

```sh
node scripts/ticket.mjs next                            # claims, prints branch + beater
git switch -c claude/ticket-12-a1b2c3
node scripts/ticket.mjs heartbeat 12 --agent a1b2c3 &   # start BEFORE you work
# ... implement, WRITE THE E2E SPEC, self-review, commit, push ...
gh pr create --draft --base main --body "Closes #12 ..."
# dispatch comment-auditor, apply
pnpm verify                                             # BOTH gates green before any reviewer
# dispatch ticket-reviewer on that sha; apply; max 3 rounds
gh pr ready                                             # this starts the pipeline
node scripts/ticket.mjs done 12 <pr-url>
node scripts/ticket.mjs ship 12
```

Run `node scripts/ticket.mjs` bare for every command. On Runner B,
`plan --issues <dump> --as <login>` prints the same steps as MCP writes; labels are REPLACED, so
send the full set it prints, and list issues with `state: all` and all pages or blocker resolution
breaks.

- **The beater is its own process** because `ship` blocks on a ~12 minute pipeline and an agent
  cannot beat from inside the wait it is doing. Beat every 5 min, dead after 20. On Runner B it is
  manual: re-post at every checkpoint. **Liveness is the comment's GitHub `updated_at`, not the
  `beat:` line** — re-posting refreshes the lock, so never spend a turn correcting a drifted one.
  `stale` lists holders, `reclaim` takes a dead one's ticket and comments what it found.
- **Claiming is verify-after-write on the COMMENT**: post it, re-read, and confirm yours is the
  lowest-numbered heartbeat. Comment ids are monotonic, so that is a lock two agents agree on
  without one. Never claim by hand.
- **The pipeline runs on PULL REQUESTS ONLY** — no `push` trigger, no `run-pipeline` hatch. Draft
  the PR while you work, since a draft runs nothing; marking it ready runs it once against
  `refs/pull/N/merge`, your head already merged into current `main`. To re-run a head, re-run the
  RUN (`gh run rerun`) — **never flip back to draft**, which races its own event into a skip.
- **Review before `gh pr ready`**, so the pipeline runs once on reviewed code. `comment-auditor`
  first — comments are the largest finding category — then BOTH gates green on a **named sha**, the
  reviewer running none and refusing a dispatch without one. `APPLY` findings you apply and ship;
  only `BLOCKING` costs a round, whose reviewer gets the previous review and the fix diff rather
  than a fresh full read. **Re-run only what a fix could break**: comment and doc edits cannot move
  a Playwright result, so say so and skip the 16 minutes. Max 3 rounds; on Runner B paste the issue
  body, since the reviewer has no `gh` either.
- **`Closes #<n>` in the PR body** is what unblocks everything under your ticket.
- **Being behind `main` is not a reason to rebase.** Only a conflict is. A push to `main` does not
  re-run open PRs, so your green can be green against a moved base — accepted deliberately, because
  requiring otherwise is the treadmill where four agents each burn a pipeline to end up where they
  started — and `deploy.yml` re-runs both gates on `main` before deploying, so a stale green is
  caught there by whoever caused it. So **merge on YOUR gate, never waiting on another agent's run**,
  and having resolved a conflict **run `pnpm check` and stop** unless it touched code a spec walks:
  CI runs the suite on the merged tree. Say which in the PR body. After a rebase `ship` reuses an
  earlier green head whose deployed-path diff is identical.
- **`ship` gates on the `gate` job**, not the run's conclusion: a run whose jobs all skipped
  concludes `success` on purpose, and `gate` is skipped in exactly that case.
- `ship` refuses onto a red `main`, squash-merges pinned with `--match-head-commit`, comments the
  squash sha, and watches the deploy.
- **A cancelled deploy is superseded, not broken** — only one run may be pending per concurrency
  group, so three quick merges cancel the middle one's.
- **Stay until your own deploy is green** — the one wait worth doing. **Red-`main` ownership is
  computed, not claimed**: the earliest still-failing deploy, which every agent reads the same way
  from `main-status`. If it is yours, fix forward — the one time pushing straight to `main` is
  allowed. **You own green, not the feature**: after ~10 minutes revert instead, including somebody
  else's merge, and reopen their ticket with the reverted sha. The squash sha, not the branch, is
  what makes that work recoverable. **If it is not yours, say so on the PR, `release`, and STOP** —
  waiting burns a session, and two agents on one break is how a revert races a fix-forward.
- **`Blocked by: #4, #5` in the body is computed on every read, never stored.** A blocker is met only
  when CLOSED, so merging unblocks with nobody relabelling. `status:review` still blocks. **Never
  infer doneness from a label** — merging does not clear `status:review`, and reading it as "still in
  review" stalled everything beneath it (`scripts/backlog.test.mjs` is the regression).
- One ticket at a time; release when you stop; always a branch and a PR, since there is no branch
  protection; never merge someone else's PR; never close an issue by hand; never `--no-verify`.

## Tests

Every ticket ships its tests in the same PR. **Player-visible behaviour needs a Playwright spec** —
a state transition a player can trigger, anything writing to D1 or broadcasting, any change to what
an existing flow shows. Pure logic gets a unit test beside its module; art, copy, docs and IaC get
neither. Worker cases go beside the module and assert through `shared/` schemas, no mocks.

**An assertion that has never failed has not been tested**: break what each new one pins and confirm
it goes red. Nothing forces a spec to EXIST — a PR without one passes both gates — so **"I could not test it" is
a line in the PR body** naming what is untested and why, never silence.

## Dispatching (for the human)

One workspace per agent; sharing a worktree defeats the lock. Paste
[`pickup-ticket.md`](../.claude/commands/pickup-ticket.md) unchanged. Do not run more agents than
there are independent ready tickets. No human reads the diff before production — the gates are the
reviewer, `pnpm check` as a pre-commit hook, the ephemeral E2E, and `deploy.yml` re-running both.
For a human in the loop, say "open the PR and stop": `done` without `ship` leaves it in
`status:review`.
