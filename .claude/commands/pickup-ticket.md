---
description: Implement one or more GitHub issues.
argument-hint: what issue(s) to pickup
---

Read `docs/AGENT-WORKFLOW.md` first — it decides whether you drive GitHub through `gh` or the GitHub
MCP tools, and it is the whole protocol. `pnpm install`, then claim with
`node scripts/ticket.mjs next` (or `plan --issues .context/issues.json --as <login>` without `gh`,
performing the writes it prints).

**Start your heartbeat before you write code** — `claim` prints the command. It is the lock; go quiet
for 20 minutes and another agent may reclaim your ticket.

Implement exactly that ticket and nothing else — if you spot adjacent work, leave it. `docs/SPEC.md`
wins over the ticket where they disagree. Ship the tests the ticket asks for.

Push and open the PR **as a draft** with `Closes #<n>` in the body. Then self-review, because every
round you cause costs a 16-minute suite: classify each comment you added under the root `CLAUDE.md`
rule and delete what does not fit; break what each new assertion pins and confirm it goes red; grep
the counts and claims your change falsifies; check that no e2e assertion waits on a value you typed
rather than on the authority. Then dispatch `comment-auditor` and apply all of it.

`pnpm test:e2e` — committing already ran `pnpm check`. **Both green on a named sha**, then dispatch
`ticket-reviewer` with that sha and the issue number (or its body, on the web runner): apply its
`APPLY` findings and ship, fix a `BLOCKING` one and go again, max 3 rounds.

Only then mark the PR ready — **that starts the pipeline** — mark the ticket done, and
`node scripts/ticket.mjs ship <n>` — **a green pipeline is not the finish line, and without `gh` the
merge is still yours**, through the MCP tools every other write goes through. **Stay until your own
deploy is green.** If it goes red, the red-`main` rule in `AGENT-WORKFLOW.md` decides whether it is
yours to fix or yours to walk away from.

Stuck or stopping early: `node scripts/ticket.mjs release <n>`.
