---
description: Turn a request into reviewed GitHub issues.
argument-hint: what you want built
---

Draft tickets from $ARGUMENTS; nothing given → ask what to build.

1. **Slice.** Read `docs/SPEC.md` and the `CLAUDE.md`s you would touch, then cut the request into tickets that each ship a vertical slice WITH its tests — knip fails on an export whose caller lands in a later ticket.
2. **Ask** only genuine open ends, in ONE `AskUserQuestion` round with a recommended answer each. Most tickets need none; never manufacture questions.
3. **Draft** to `.context/tickets/<slug>.md` (gitignored, not GitHub yet): **Goal**, **Scope**, **Acceptance** checkboxes, a `Blocked by:` line when it depends on another (include the existing tickets on gh issues), one `epic:*` and one `size:*`. MEDIUM-specific — the decision the implementer must make and its constraints ("pick one and say why in the PR"), never a transcript of the code.
4. **Validate** all drafts at once with the `ticket-architect` subagent; fix what it returns, re-dispatch a fresh one, max 2 rounds, then report anything unresolved.
5. **Summarise** each ticket in 2-3 lines and STOP. Publish nothing until the user says yes.
6. **Publish** with `gh issue create` (`epic:*`, `size:*`, `status:ready`), swap the `Blocked by:` slugs for the real numbers, print the URLs.
