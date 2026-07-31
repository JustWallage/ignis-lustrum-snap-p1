const STATUS = ["status:ready", "status:in-progress", "status:review"];

const RETIRED_STATUS = ["status:blocked"];

const ALL_STATUS = [...STATUS, ...RETIRED_STATUS];

export function isDocsOnly(paths) {
  return paths.length > 0 && paths.every((p) => p.endsWith(".md"));
}

/** Every agent shares one GitHub login, so `assignees` cannot say WHICH agent holds a
 * ticket. This comment can, and GitHub's `updated_at` on it is the liveness clock. */
export const HEARTBEAT_MARKER = "<!-- ticket-heartbeat -->";

export const HEARTBEAT_BEAT_MS = 5 * 60 * 1000;
export const HEARTBEAT_STALE_MS = 20 * 60 * 1000;

/** A beater outliving its agent would keep a dead ticket looking alive. */
export const HEARTBEAT_MAX_MS = 4 * 60 * 60 * 1000;

export function heartbeatBody({ agent, branch, doing, at }) {
  return [
    HEARTBEAT_MARKER,
    `agent: \`${agent}\``,
    `branch: \`${branch}\``,
    `doing: ${doing}`,
    `beat: ${at}`,
  ].join("\n");
}

function field(body, name) {
  const found = new RegExp(`^${name}: \`?([^\`\n]+)\`?$`, "m").exec(body);
  return found === null ? null : found[1].trim();
}

export function parseHeartbeat(comment) {
  const body = comment.body ?? "";
  if (!body.startsWith(HEARTBEAT_MARKER)) return null;
  const agent = field(body, "agent");
  if (agent === null) return null;
  return {
    id: comment.id,
    agent,
    branch: field(body, "branch"),
    doing: field(body, "doing"),
    updatedAt: comment.updated_at,
  };
}

/** Comment ids are monotonic and `created_at` is only second-granular, so the LOWEST id
 * wins a race — two agents agree on that with nothing to lock. */
export function heartbeatHolder(comments) {
  return (
    comments
      .map(parseHeartbeat)
      .filter((beat) => beat !== null)
      .sort((a, b) => a.id - b.id)[0] ?? null
  );
}

export function isStale(updatedAt, now, ttlMs = HEARTBEAT_STALE_MS) {
  return now - Date.parse(updatedAt) > ttlMs;
}

/**
 * Takes `gh run list`'s newest-first Deploy runs.
 *
 * A `cancelled` run is SUPERSEDED, never a failure: only one run may be PENDING per
 * concurrency group, so a third merge cancels the second's queued deploy.
 *
 * The owner is the EARLIEST consecutive failure — later merges landed on a tree that was
 * already broken — so every agent computes the same one with nothing to contend for.
 */
export function mainStatus(runs) {
  const decided = runs.filter(
    (run) =>
      run.status === "completed" &&
      run.conclusion !== "cancelled" &&
      run.conclusion !== "skipped",
  );
  const running = runs.some((run) => run.status !== "completed");
  const latest = decided[0];
  if (latest === undefined) {
    return { state: running ? "running" : "unknown", owner: null, running };
  }
  if (latest.conclusion === "success") {
    return { state: running ? "running" : "green", owner: null, running };
  }
  let owner = latest;
  for (const run of decided) {
    if (run.conclusion === "success") break;
    owner = run;
  }
  return { state: "red", owner, running };
}

/** Two diffs of one change against different bases disagree only on blob hashes. */
export function normalizePatch(text) {
  return text
    .split("\n")
    .filter((line) => !line.startsWith("index "))
    .join("\n")
    .trim();
}

export function blockersOf(body) {
  const line = /^\s*Blocked by:\s*(.+)$/im.exec(body ?? "");
  if (line === null) return [];
  return [...line[1].matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
}

/**
 * The ONE definition of blocked. CLOSED is the only "done", read from the issue's STATE:
 * `done` sets `status:review` and merging closes the issue without clearing it, so
 * reading that label as "still in review" stalls the graph under every merged ticket.
 */
export function unmetBlockers(issue, issues) {
  const state = new Map(issues.map((i) => [i.number, i.state]));
  return blockersOf(issue.body).filter((n) => state.get(n) !== "CLOSED");
}

export function statusOf(issue) {
  const found = issue.labels
    .map((l) => l.name)
    .find((n) => ALL_STATUS.includes(n));
  return found ?? "status:ready";
}

function prefixed(issue, prefix, fallback) {
  const found = issue.labels
    .map((l) => l.name)
    .find((n) => n.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

export function sizeOf(issue) {
  return prefixed(issue, "size:", "?");
}

export function epicOf(issue) {
  return prefixed(issue, "epic:", "-");
}

export function normalizeIssue(raw) {
  const named = (list, key) =>
    (Array.isArray(list) ? list : []).map((entry) =>
      typeof entry === "string"
        ? { [key]: entry }
        : { [key]: entry[key] ?? "" },
    );
  return {
    number: Number(raw.number),
    title: String(raw.title ?? ""),
    body: String(raw.body ?? ""),
    labels: named(raw.labels, "name"),
    assignees: named(raw.assignees, "login"),
    state: String(raw.state ?? "open").toUpperCase(),
  };
}

export function readyList(issues) {
  return issues
    .filter((i) => i.state === "OPEN")
    .filter((i) => i.assignees.length === 0)
    .filter((i) => statusOf(i) !== "status:in-progress")
    .filter((i) => unmetBlockers(i, issues).length === 0)
    .sort((a, b) => a.number - b.number);
}

export function displayStateOf(issue, issues) {
  if (issue.state === "CLOSED") return "closed";
  const label = statusOf(issue).slice("status:".length);
  if (label === "in-progress" || label === "review") return label;
  return unmetBlockers(issue, issues).length > 0 ? "blocked" : "ready";
}

export function labelsFor(issue, status) {
  const target = status.startsWith("status:") ? status : `status:${status}`;
  if (RETIRED_STATUS.includes(target)) {
    throw new Error(
      `"${target}" is retired — blockedness is computed, never labelled. Use one of: ${STATUS.join(", ")}`,
    );
  }
  if (!STATUS.includes(target)) {
    throw new Error(`Unknown status "${status}". One of: ${STATUS.join(", ")}`);
  }
  const kept = issue.labels
    .map((l) => l.name)
    .filter((name) => !ALL_STATUS.includes(name));
  return [...kept, target];
}
