#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  displayStateOf,
  epicOf,
  HEARTBEAT_BEAT_MS,
  HEARTBEAT_MAX_MS,
  HEARTBEAT_STALE_MS,
  heartbeatBody,
  heartbeatHolder,
  isDocsOnly,
  isStale,
  labelsFor,
  mainStatus,
  normalizeIssue,
  normalizePatch,
  readyList,
  sizeOf,
  unmetBlockers,
} from "./backlog.mjs";

const BRANCH_PIPELINE = "branch-pipeline.yml";
const DEPLOY = "deploy.yml";

/** The one job whose success means "CI verified this head". See branch-pipeline.yml. */
const GATE_JOB = "gate";

const NO_GH = [
  "The `gh` CLI is unavailable here (Claude Code web containers have no `gh`",
  "and no direct GitHub API access). Use the MCP path instead:",
  "",
  "  1. list every issue (state: all, ALL pages) with the GitHub MCP tools",
  "  2. write the raw JSON array to .context/issues.json",
  "  3. node scripts/ticket.mjs plan --issues .context/issues.json",
  "",
  'See docs/AGENT-WORKFLOW.md § "Runner B".',
].join("\n");

function gh(args, { allowFail = false } = {}) {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (allowFail) return null;
    const stderr = error.stderr ? String(error.stderr).trim() : error.message;
    if (error.code === "ENOENT" || /HTTP 40[13]|authentic/i.test(stderr)) {
      throw new Error(`gh ${args.join(" ")}\n${stderr}\n\n${NO_GH}`, {
        cause: error,
      });
    }
    throw new Error(`gh ${args.join(" ")}\n${stderr}`, { cause: error });
  }
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function ghStream(args) {
  execFileSync("gh", args, { stdio: ["ignore", "inherit", "inherit"] });
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function comments(number) {
  return ghJson([
    "api",
    "--paginate",
    `repos/{owner}/{repo}/issues/${number}/comments`,
  ]);
}

function postComment(number, body) {
  return ghJson([
    "api",
    "-X",
    "POST",
    `repos/{owner}/{repo}/issues/${number}/comments`,
    "-f",
    `body=${body}`,
  ]);
}

function patchComment(id, body) {
  gh(
    [
      "api",
      "-X",
      "PATCH",
      `repos/{owner}/{repo}/issues/comments/${id}`,
      "-f",
      `body=${body}`,
    ],
    { allowFail: true },
  );
}

function deleteComment(id) {
  gh(["api", "-X", "DELETE", `repos/{owner}/{repo}/issues/comments/${id}`], {
    allowFail: true,
  });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function say(...lines) {
  process.stdout.write(`${lines.join("\n")}\n`);
}

function readIssues(path) {
  const parsed = JSON.parse(readFileSync(path === "-" ? 0 : path, "utf8"));
  const list = Array.isArray(parsed)
    ? parsed
    : [parsed.items, parsed.issues, parsed.data].find(Array.isArray);
  if (list === undefined) {
    throw new Error(
      `${path} is not a JSON array of issues (nor {items|issues|data: [...]}).`,
    );
  }
  return list
    .filter((raw) => raw.pull_request === undefined)
    .map(normalizeIssue);
}

function ghIssues() {
  return ghJson([
    "issue",
    "list",
    "--state",
    "all",
    "--limit",
    "300",
    "--json",
    "number,title,body,labels,assignees,state",
  ]).map(normalizeIssue);
}

function claim(number, issues) {
  const issue = requireIssue(issues, number);
  if (issue.state !== "OPEN") throw new Error(`#${number} is closed`);

  const unmet = unmetBlockers(issue, issues);
  if (unmet.length > 0) {
    throw new Error(
      `#${number} is blocked by ${unmet.map((n) => `#${n}`).join(", ")}`,
    );
  }

  const held = heartbeatHolder(comments(number));
  if (held !== null) {
    throw new Error(
      [
        `#${number} is held by agent ${held.agent} on ${held.branch}.`,
        `Last beat ${held.updatedAt} — doing: ${held.doing}`,
        "",
        "`stale` says whether that agent is still alive; `reclaim` takes a dead",
        "one's ticket. Never take a live one.",
      ].join("\n"),
    );
  }
  if (issue.assignees.length > 0) {
    throw new Error(
      `#${number} is assigned but has no heartbeat. Run \`stale\` — it was claimed before heartbeats existed, or the claim crashed mid-write.`,
    );
  }

  const agent = randomBytes(3).toString("hex");
  const branch = `claude/ticket-${number}-${agent}`;
  const mine = postComment(
    number,
    heartbeatBody({
      agent,
      branch,
      doing: "claimed",
      at: new Date().toISOString(),
    }),
  );

  // Verify-after-write on the COMMENT, not the assignee: one shared gh login made
  // "am I the sole assignee" a tautology two racing agents both passed.
  const holder = heartbeatHolder(comments(number));
  if (holder === null || holder.id !== mine.id) {
    deleteComment(mine.id);
    return null;
  }

  // A findability flag for `gh issue list --assignee "*"`, no longer the lock.
  gh(["issue", "edit", String(number), "--add-assignee", "@me"], {
    allowFail: true,
  });
  gh([
    "issue",
    "edit",
    String(number),
    "--add-label",
    "status:in-progress",
    "--remove-label",
    "status:ready",
  ]);
  return { issue, agent, branch };
}

function heartbeat(number, agent, doing) {
  const until = Date.now() + HEARTBEAT_MAX_MS;
  while (Date.now() < until) {
    const holder = heartbeatHolder(comments(number));
    if (holder === null) {
      say(`#${number} has no heartbeat any more — it was reclaimed. Stopping.`);
      return;
    }
    if (holder.agent !== agent) {
      say(`#${number} now belongs to agent ${holder.agent}. Stopping.`);
      return;
    }
    patchComment(
      holder.id,
      heartbeatBody({
        agent,
        branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
        doing,
        at: new Date().toISOString(),
      }),
    );
    sleep(HEARTBEAT_BEAT_MS);
  }
  say(
    `Heartbeat for #${number} hit its ${HEARTBEAT_MAX_MS / 3_600_000}h ceiling and stopped.`,
  );
}

function reclaim(number, issues) {
  requireIssue(issues, number);
  const holder = heartbeatHolder(comments(number));
  if (holder !== null && !isStale(holder.updatedAt, Date.now())) {
    const age = Math.round((Date.now() - Date.parse(holder.updatedAt)) / 60000);
    throw new Error(
      `#${number} is ALIVE: agent ${holder.agent} beat ${age}m ago on ${holder.branch}. Leave it alone.`,
    );
  }

  const found =
    holder === null
      ? "no heartbeat at all — claimed before heartbeats existed, or the claim crashed"
      : `agent ${holder.agent}, branch \`${holder.branch}\`, last beat ${holder.updatedAt}, doing: ${holder.doing}`;
  const abandoned =
    holder?.branch === undefined
      ? []
      : ghJson([
          "pr",
          "list",
          "--head",
          holder.branch,
          "--state",
          "all",
          "--json",
          "number,url,state",
        ]);

  if (holder !== null) deleteComment(holder.id);
  gh(["issue", "edit", String(number), "--remove-assignee", "@me"], {
    allowFail: true,
  });
  postComment(
    number,
    [
      `Reclaimed a dead claim on #${number}.`,
      "",
      `Found: ${found}`,
      abandoned.length === 0
        ? "No pull request was ever opened for that branch."
        : `Its work may still be recoverable from: ${abandoned.map((pr) => `${pr.url} (${pr.state})`).join(", ")}`,
    ].join("\n"),
  );
  say(`Dropped the dead claim on #${number}. Found: ${found}`);
  if (abandoned.length > 0) {
    say(
      `Abandoned work: ${abandoned.map((pr) => `${pr.url} (${pr.state})`).join(", ")}`,
    );
  }
  return claim(
    number,
    issues.map((i) => (i.number === number ? { ...i, assignees: [] } : i)),
  );
}

function runFor(workflow, sha) {
  const runs = ghJson([
    "run",
    "list",
    "--commit",
    sha,
    "--workflow",
    workflow,
    "--limit",
    "1",
    "--json",
    "databaseId,status,conclusion,url",
  ]);
  return runs[0];
}

function waitForRun(workflow, sha) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const run = runFor(workflow, sha);
    if (run !== undefined) return run;
    sleep(3000);
  }
  return undefined;
}

function watchRun(run, { allowFail = false } = {}) {
  try {
    ghStream(["run", "watch", String(run.databaseId), "--exit-status"]);
  } catch (error) {
    if (!allowFail) throw error;
  }
}

/** The RUN's conclusion cannot answer this: a run whose jobs all skipped concludes
 * `success` on purpose, so branch-pipeline.yml SKIPS `gate` when nothing was triggered. */
function gateSucceeded(runId) {
  const { jobs } = ghJson(["run", "view", String(runId), "--json", "jobs"]);
  return jobs.some(
    (job) => job.name === GATE_JOB && job.conclusion === "success",
  );
}

function hasCommit(sha) {
  return (
    gh(["api", `repos/{owner}/{repo}/commits/${sha}`, "--jq", ".sha"], {
      allowFail: true,
    }) !== null
  );
}

function deployedPatch(sha) {
  const base = git(["merge-base", "origin/main", sha]);
  return normalizePatch(git(["diff", base, sha, "--", ".", ":(exclude)*.md"]));
}

/**
 * A rebase changes your head sha and discards 12 minutes of CI — but if it only replayed
 * your patch, the deployed-path diff is byte-identical and re-running proves nothing.
 *
 * This does NOT claim the merged result is unchanged; `main` moved. Accepting that is the
 * same stale-green trade the rest of the protocol rests on.
 */
function reusableGreenRun(branch, headSha) {
  const mine = deployedPatch(headSha);
  const runs = ghJson([
    "run",
    "list",
    "--workflow",
    BRANCH_PIPELINE,
    "--branch",
    branch,
    "--limit",
    "20",
    "--json",
    "databaseId,headSha,status,conclusion,url",
  ]);
  for (const run of runs) {
    if (run.headSha === headSha) continue;
    if (run.status !== "completed" || run.conclusion !== "success") continue;
    if (!hasCommit(run.headSha)) continue;
    if (deployedPatch(run.headSha) !== mine) continue;
    if (!gateSucceeded(run.databaseId)) continue;
    return run;
  }
  return undefined;
}

/**
 * Usually TWO runs per head sha — the push's and the pull request's — because GitHub
 * reports a `pull_request` run's `headSha` as the PR HEAD, not the merge commit. Only one
 * carries a `gate`, so the newest run is the wrong one to ask.
 */
function pipelineRuns(sha) {
  return ghJson([
    "run",
    "list",
    "--commit",
    sha,
    "--workflow",
    BRANCH_PIPELINE,
    "--limit",
    "10",
    "--json",
    "databaseId,status,conclusion,url,event",
  ]);
}

/** Refuse to merge code CI has never run. */
function requireGreenPipeline(branch, sha, changed) {
  if (isDocsOnly(changed)) {
    say(
      "Docs-only change — deploy.yml ignores **/*.md. No pipeline to gate on.",
    );
    return;
  }

  // The push run finishes while the PR's is still queued, so settling once is not enough.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const runs = pipelineRuns(sha);
    const verified = runs.find(
      (run) => run.status === "completed" && gateSucceeded(run.databaseId),
    );
    if (verified !== undefined) {
      say(`Branch pipeline green on ${sha.slice(0, 7)} — ${verified.url}`);
      return;
    }
    const pending = runs.find((run) => run.status !== "completed");
    if (pending === undefined) break;
    say(`Branch pipeline still running — ${pending.url}`);
    watchRun(pending, { allowFail: true });
  }

  const failed = pipelineRuns(sha).find(
    (run) => run.conclusion === "failure" || run.conclusion === "timed_out",
  );
  if (failed !== undefined) {
    throw new Error(
      `Branch pipeline ${failed.conclusion} on ${sha.slice(0, 7)} — fix it, do not merge it.\n${failed.url}`,
    );
  }

  const reusable = reusableGreenRun(branch, sha);
  if (reusable !== undefined) {
    say(
      `No pipeline for ${sha.slice(0, 7)}, but ${reusable.headSha.slice(0, 7)} is green and`,
      "its deployed-path diff is byte-identical — the rebase only replayed your patch.",
      `Merging on that. ${reusable.url}`,
    );
    return;
  }

  throw new Error(
    [
      `Nothing has verified ${sha.slice(0, 7)}, so there is nothing to merge on.`,
      "",
      "Open a pull request and mark it READY FOR REVIEW: the pipeline then runs on",
      "your head already merged into current `main`, which is the thing worth",
      "testing. A draft PR runs nothing.",
      "",
      "Rerun `ship` when it is green.",
    ].join("\n"),
  );
}

function deployRuns() {
  return ghJson([
    "run",
    "list",
    "--workflow",
    DEPLOY,
    "--branch",
    "main",
    "--limit",
    "20",
    "--json",
    "databaseId,status,conclusion,url,headSha,createdAt",
  ]);
}

/** Squash merges carry "(#N)" in their title. */
function ticketOf(sha) {
  const title = gh(
    ["api", `repos/{owner}/{repo}/commits/${sha}`, "--jq", ".commit.message"],
    { allowFail: true },
  );
  const found = /\(#(\d+)\)/.exec(title ?? "");
  return found === null ? null : Number(found[1]);
}

function describeMain(status) {
  if (status.state !== "red") {
    return [`main is ${status.state}.`];
  }
  const { owner } = status;
  const ticket = ticketOf(owner.headSha);
  const minutes = Math.round(
    (Date.now() - Date.parse(owner.createdAt)) / 60000,
  );
  return [
    `main is RED and has been for ${minutes}m.`,
    `The break is ${owner.headSha.slice(0, 12)}${ticket === null ? "" : ` (#${ticket})`} — ${owner.url}`,
    "",
    "That merge's agent owns restoring green: it is the EARLIEST failing deploy, so",
    "everything after it landed on a tree that was already broken. Ownership is",
    "computed, not claimed — every agent reads the same answer out of `main-status`.",
    status.running
      ? "A deploy is in flight right now, so a fix may already be landing. Wait for it."
      : "Nothing is deploying, so nobody is currently fixing it.",
  ];
}

function watchMain(sha, changed) {
  if (isDocsOnly(changed)) {
    say("Docs-only — deploy.yml skips **/*.md pushes. Nothing deploys.");
    return;
  }
  const run = waitForRun(DEPLOY, sha);
  if (run === undefined) {
    throw new Error(
      `Merged, but no Deploy run appeared for ${sha.slice(0, 7)}. Check the Actions tab yourself — the merge is already on main.`,
    );
  }
  say(`Watching the production deploy — ${run.url}`);
  watchRun(run, { allowFail: true });

  // A cancelled run is SUPERSEDED, not a break: only one run may be PENDING per
  // concurrency group, so a third merge cancels the second's queued deploy.
  const settled = runFor(DEPLOY, sha) ?? run;
  if (settled.conclusion === "cancelled" || settled.conclusion === "skipped") {
    say(
      `Your deploy was ${settled.conclusion} — a later merge superseded it before it ran.`,
      "That is not a break. The run that covers your code is a later one:",
    );
  } else if (settled.conclusion !== "success") {
    throw new Error(
      [
        ...describeMain(mainStatus(deployRuns())),
        "",
        "Every other agent's `ship` is blocked until this is green. If the break is",
        "yours, fix forward — this is the one case where pushing straight to `main`",
        "is allowed:",
        `  gh run view ${settled.databaseId} --log-failed`,
        "  git switch main && git pull",
        "  ...fix, `pnpm check` must pass, then: git push origin main",
        "",
        "You own GREEN, not this feature. Within ~10 minutes, revert instead — and you",
        "may revert somebody else's merge to do it. Reopen their ticket with the",
        "reverted sha and the failing run, and their work is recoverable from it:",
        `  git switch main && git pull && git revert <merge-sha> && git push origin main`,
      ].join("\n"),
    );
  }

  const status = mainStatus(deployRuns());
  say(...describeMain(status));
  if (status.state === "red") {
    throw new Error(
      "main is red. Read the ownership line above: if it names your merge, it is yours.",
    );
  }
}

function ship(number, issues) {
  const issue = requireIssue(issues, number);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === "main") {
    throw new Error("`ship` runs from your ticket branch, never from main.");
  }

  const before = mainStatus(deployRuns());
  if (before.state === "red") {
    throw new Error(
      [
        ...describeMain(before),
        "",
        "Nothing merges onto a red main. Wait for the owning agent — do not help",
        "unless it is yours: two agents fixing one break is how a revert races a",
        "fix-forward. `main-status` tells you when it clears.",
      ].join("\n"),
    );
  }

  git(["fetch", "origin", "main"]);
  const pr = ghJson([
    "pr",
    "view",
    "--json",
    "number,state,isDraft,mergeable,headRefOid,url",
  ]);
  if (pr.state !== "OPEN") throw new Error(`PR #${pr.number} is ${pr.state}.`);
  if (pr.isDraft) {
    throw new Error(
      `PR #${pr.number} is a DRAFT, so the pipeline never ran on it.\n  gh pr ready ${pr.number}`,
    );
  }
  if (pr.mergeable === "CONFLICTING") {
    throw new Error(
      `PR #${pr.number} conflicts with main — other agents landed underneath you.\n  git fetch origin && git rebase origin/main && git push --force-with-lease`,
    );
  }
  if (git(["rev-parse", "HEAD"]) !== pr.headRefOid) {
    throw new Error("Local HEAD is not what the PR points at — push first.");
  }

  const changed = git(["diff", "--name-only", "origin/main...HEAD"])
    .split("\n")
    .filter((line) => line !== "");
  requireGreenPipeline(branch, pr.headRefOid, changed);

  // --match-head-commit: if anyone pushed to the branch since the check above,
  // refuse rather than merge the unverified commit.
  gh([
    "pr",
    "merge",
    String(pr.number),
    "--squash",
    "--match-head-commit",
    pr.headRefOid,
  ]);
  say(`Merged PR #${pr.number}.`);

  // `Closes #<n>` should have closed it. Without that line the issue stays open and
  // silently blocks everything under it, so close it and say so loudly.
  const after = ghJson(["issue", "view", String(number), "--json", "state"]);
  if (after.state !== "CLOSED") {
    gh(["issue", "close", String(number), "--reason", "completed"]);
    say(
      `WARNING: #${number} did not auto-close — PR #${pr.number} was missing "Closes #${number}".`,
      "Closed it by hand. Put that line in the PR body next time; it is what unblocks the graph.",
    );
  }
  say(`#${number} — ${issue.title}: closed.`);

  const merged = ghJson([
    "pr",
    "view",
    String(pr.number),
    "--json",
    "mergeCommit",
  ]);
  const squashed = merged.mergeCommit.oid;

  // A squash puts the ticket in ONE commit that outlives a revert, so this sha — not the
  // branch, which is about to be deleted — is what makes reverted work recoverable.
  postComment(
    number,
    `Merged as \`${squashed}\` (squash of PR #${pr.number}). If this is ever reverted, the work is recoverable with \`git cherry-pick ${squashed.slice(0, 12)}\`.`,
  );

  // The heartbeat IS the claim, so dropping it is what releases the lock.
  const holder = heartbeatHolder(comments(number));
  if (holder !== null) deleteComment(holder.id);

  gh(["api", "-X", "DELETE", `repos/{owner}/{repo}/git/refs/heads/${branch}`], {
    allowFail: true,
  });
  watchMain(squashed, changed);
}

function announceClaim({ issue, agent, branch }) {
  say(`Claimed #${issue.number} as agent ${agent}.`);
  printIssue(issue);
  say(
    "",
    "Start the heartbeat FIRST — it is what proves you are alive, and it has to be",
    "its own process: `ship` blocks on a ~12 minute pipeline and cannot beat from",
    "inside that wait.",
    "",
    `  git switch -c ${branch}`,
    `  node scripts/ticket.mjs heartbeat ${issue.number} --agent ${agent} &`,
    "",
  );
}

function printIssue(issue) {
  process.stdout.write(`\n#${issue.number} — ${issue.title}\n`);
  process.stdout.write(`${"=".repeat(60)}\n${issue.body ?? ""}\n`);
}

function printTable(rows, all) {
  if (rows.length === 0) {
    process.stdout.write("(none)\n");
    return;
  }
  for (const issue of rows) {
    const who = issue.assignees.map((a) => a.login).join(",") || "-";
    const unmet = unmetBlockers(issue, all);
    const blocked =
      unmet.length > 0
        ? ` blocked-by:${unmet.map((n) => `#${n}`).join(",")}`
        : "";
    const state = displayStateOf(issue, all);
    process.stdout.write(
      `#${String(issue.number).padStart(3)} [${state.padEnd(11)}] ${epicOf(issue).padEnd(10)} ${sizeOf(issue)}  ${issue.title}  @${who}${blocked}\n`,
    );
  }
}

function parseArgs(argv) {
  const flags = new Map();
  const args = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${token} needs a value`);
      flags.set(token.slice(2), value);
      i += 1;
    } else {
      args.push(token);
    }
  }
  return { flags, args };
}

const [command, ...argv] = process.argv.slice(2);
const { flags, args: rest } = parseArgs(argv);

function allIssues() {
  const file = flags.get("issues");
  return file === undefined ? ghIssues() : readIssues(file);
}

function requireIssue(issues, number) {
  const issue = issues.find((i) => i.number === number);
  if (issue === undefined) throw new Error(`No such issue: #${number}`);
  return issue;
}

process.on("uncaughtException", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

switch (command) {
  case "list": {
    const issues = allIssues();
    printTable(
      issues.filter((i) => i.state === "OPEN"),
      issues,
    );
    break;
  }

  case "ready": {
    const issues = allIssues();
    printTable(readyList(issues), issues);
    break;
  }

  case "show":
    printIssue(requireIssue(allIssues(), Number(rest[0])));
    break;

  case "plan": {
    const ready = readyList(allIssues());
    const wanted = rest[0] === undefined ? undefined : Number(rest[0]);
    if (wanted !== undefined && !ready.some((i) => i.number === wanted)) {
      throw new Error(
        `#${wanted} is not claimable: it is closed, blocked, or already assigned. Run \`ready\`.`,
      );
    }
    const [pick, ...fallbacks] =
      wanted === undefined
        ? ready
        : [
            ...ready.filter((i) => i.number === wanted),
            ...ready.filter((i) => i.number !== wanted),
          ];
    if (pick === undefined) {
      process.stdout.write(
        "Nothing claimable right now — every ready ticket is taken or blocked.\n",
      );
      break;
    }
    const login = flags.get("as") ?? "<your-login>";
    const agent = randomBytes(3).toString("hex");
    const branch = `claude/ticket-${pick.number}-${agent}`;
    printIssue(pick);
    process.stdout.write(
      [
        "",
        `Claim #${pick.number} through the GitHub MCP tools, in this order:`,
        `  1. add_issue_comment on #${pick.number} with EXACTLY this body:`,
        "",
        heartbeatBody({
          agent,
          branch,
          doing: "claimed",
          at: new Date().toISOString(),
        })
          .split("\n")
          .map((line) => `       ${line}`)
          .join("\n"),
        "",
        `  2. RE-READ #${pick.number}'s comments. Of every comment starting with that`,
        `     marker, the LOWEST id must be yours. If it is not, you lost the race —`,
        `     delete yours and rerun plan.`,
        `  3. update issue #${pick.number}: assignees = ["${login}"]`,
        `     (a findability flag, NOT the lock — every agent shares one login)`,
        `  4. update issue #${pick.number}: labels = ${JSON.stringify(labelsFor(pick, "in-progress"))}`,
        `     (labels are REPLACED, not merged — send exactly that list)`,
        "",
        `  Then work on branch ${branch}, and RE-POST that comment with a fresh`,
        `  "beat:" timestamp at every checkpoint. It is your only liveness signal:`,
        `  go quiet and another agent may reclaim the ticket out from under you.`,
        fallbacks.length > 0
          ? `\nIf #${pick.number} is taken, the next candidates are ${fallbacks.map((i) => `#${i.number}`).join(", ")}.`
          : `\nThere is no fallback: #${pick.number} is the only claimable ticket.`,
        "",
      ].join("\n"),
    );
    break;
  }

  case "labels": {
    const issue = requireIssue(allIssues(), Number(rest[0]));
    const status = rest[1];
    if (status === undefined) {
      throw new Error(
        "Usage: ticket.mjs labels <n> <ready|in-progress|review>",
      );
    }
    const lines = [
      `#${issue.number} labels = ${JSON.stringify(labelsFor(issue, status))}`,
      "(full replacement set — send exactly this list)",
    ];
    if (status.endsWith("ready")) {
      lines.push(
        "Also set assignees = [] — releasing means dropping the lock.",
      );
    }
    process.stdout.write(`${lines.join("\n")}\n`);
    break;
  }

  case "next": {
    const issues = allIssues();
    for (const candidate of readyList(issues)) {
      const claimed = claim(candidate.number, issues);
      if (claimed !== null) {
        announceClaim(claimed);
        process.exit(0);
      }
      process.stdout.write(
        `#${candidate.number} was taken, trying the next one...\n`,
      );
    }
    process.stdout.write(
      "Nothing claimable right now — every ready ticket is taken or blocked.\n",
    );
    break;
  }

  case "claim": {
    const claimed = claim(Number(rest[0]), allIssues());
    if (claimed === null) {
      process.stdout.write(
        `Lost the race for #${rest[0]}; it is claimed by someone else.\n`,
      );
      process.exit(1);
    }
    announceClaim(claimed);
    break;
  }

  case "reclaim": {
    const n = Number(rest[0]);
    const claimed = reclaim(n, allIssues());
    if (claimed === null) {
      process.stdout.write(
        `Dropped #${n}'s dead claim but lost the reclaim.\n`,
      );
      process.exit(1);
    }
    announceClaim(claimed);
    break;
  }

  case "heartbeat": {
    const agent = flags.get("agent");
    if (agent === undefined) {
      throw new Error(
        "Usage: ticket.mjs heartbeat <n> --agent <id> [--doing <text>]  (run it with `&`)",
      );
    }
    heartbeat(Number(rest[0]), agent, flags.get("doing") ?? "working");
    break;
  }

  case "stale": {
    const issues = allIssues();
    const held = issues.filter(
      (i) => i.state === "OPEN" && i.assignees.length > 0,
    );
    if (held.length === 0) {
      process.stdout.write("No ticket is held right now.\n");
      break;
    }
    for (const issue of held) {
      const holder = heartbeatHolder(comments(issue.number));
      if (holder === null) {
        say(
          `#${issue.number} UNKNOWN  no heartbeat — claimed before heartbeats, or the claim crashed. ${issue.title}`,
        );
        continue;
      }
      const age = Math.round(
        (Date.now() - Date.parse(holder.updatedAt)) / 60000,
      );
      const verdict = isStale(holder.updatedAt, Date.now())
        ? "STALE  "
        : "alive  ";
      say(
        `#${issue.number} ${verdict}agent ${holder.agent} on ${holder.branch}, ${age}m since last beat — doing: ${holder.doing}`,
      );
    }
    say(
      "",
      `Stale means ${HEARTBEAT_STALE_MS / 60000}m without a beat, i.e. the agent died.`,
      "`reclaim <n>` takes a dead one's ticket. It refuses a live one.",
    );
    break;
  }

  case "main-status":
    say(...describeMain(mainStatus(deployRuns())));
    break;

  case "release": {
    const n = String(Number(rest[0]));
    const holder = heartbeatHolder(comments(Number(rest[0])));
    if (holder !== null) deleteComment(holder.id);
    gh(["issue", "edit", n, "--remove-assignee", "@me"], { allowFail: true });
    gh([
      "issue",
      "edit",
      n,
      "--add-label",
      "status:ready",
      "--remove-label",
      "status:in-progress",
    ]);
    process.stdout.write(`Released #${n}.\n`);
    break;
  }

  case "done": {
    const n = String(Number(rest[0]));
    const pr = rest[1];
    gh([
      "issue",
      "edit",
      n,
      "--add-label",
      "status:review",
      "--remove-label",
      "status:in-progress",
    ]);
    if (pr !== undefined) gh(["issue", "comment", n, "--body", `PR: ${pr}`]);
    say(
      `#${n} is up for review. Nobody else is coming to do it: once the pipeline`,
      `on your ready PR is green, \`ship ${n}\`.`,
    );
    break;
  }

  case "ship":
    ship(Number(rest[0]), allIssues());
    break;

  case "watch-main": {
    const sha = rest[0] ?? git(["rev-parse", "origin/main"]);
    watchMain(
      sha,
      git(["diff", "--name-only", `${sha}~1`, sha])
        .split("\n")
        .filter((line) => line !== ""),
    );
    break;
  }

  default:
    process.stdout.write(
      [
        "Usage: node scripts/ticket.mjs <command>",
        "",
        "  next               claim the next ready, unblocked ticket",
        "  ready              list claimable tickets",
        "  list               list all open tickets",
        "  show <n>           print one ticket",
        "  claim <n>          claim a specific ticket",
        "  release <n>        hand a ticket back",
        "  done <n> [pr-url]  mark ready for review, once the PR is open",
        "  ship <n>           merge your own PR, then watch main's deploy",
        "  watch-main [sha]   re-attach to a deploy you started",
        "",
        "  heartbeat <n> --agent <id> [--doing <text>]",
        "                     prove you are alive. Run it with `&`, once, right",
        "                     after claiming — `claim` prints the exact line.",
        "  stale              who holds what, and whether that agent still breathes",
        "  reclaim <n>        take a DEAD agent's ticket (refuses a live one)",
        "  main-status        is main green, and if not, whose merge owns it",
        "",
        "Without `gh` (Claude Code web) — reads come from a JSON dump you saved",
        "from the GitHub MCP tools, writes you make through those same tools:",
        "",
        "  plan [n]           which ticket to claim, and the writes to make",
        "  labels <n> <status>  the full label set for a transition",
        "  --issues <file>    read issues from a JSON dump instead of `gh`",
        "                     (works with plan/labels/ready/list/show; `-` is stdin)",
        "  --as <login>       your GitHub login, for plan's instructions",
        "",
        "See docs/AGENT-WORKFLOW.md.",
        "",
      ].join("\n"),
    );
}
