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
wins over the ticket where they disagree. Ship the tests the ticket asks for. **Comments are gotchas
only**; read the rule in the root `CLAUDE.md` before writing one.

`pnpm check`, then `pnpm verify`. Push and open the PR **as a draft** with `Closes #<n>` in the body.
Then dispatch the `ticket-reviewer` subagent with your branch, which gates passed, and the issue
number (or its body pasted in, on the web runner). Fix, re-verify, fresh reviewer, max 3 rounds.

Only then mark the PR ready — **that starts the pipeline** — mark the ticket done, and
`node scripts/ticket.mjs ship <n>`. **Stay until `main` is green.** If your deploy goes red,
`main-status` names the merge that owns it: fix forward or revert within ~10 minutes if that is
yours, and wait if it is not.

Stuck or stopping early: `node scripts/ticket.mjs release <n>`.
