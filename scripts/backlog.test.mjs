import { describe, expect, it } from "vitest";

import {
  blockersOf,
  displayStateOf,
  heartbeatBody,
  heartbeatHolder,
  isDocsOnly,
  isStale,
  labelsFor,
  mainStatus,
  normalizeIssue,
  normalizePatch,
  parseHeartbeat,
  readyList,
  unmetBlockers,
} from "./backlog.mjs";

function issue(
  number,
  { body = "", labels = [], assignees = [], state = "OPEN" } = {},
) {
  return normalizeIssue({
    number,
    title: `#${number}`,
    body,
    labels,
    assignees,
    state,
  });
}

function blockedBy(...numbers) {
  return `Some ticket prose.\n\nBlocked by: ${numbers.map((n) => `#${n}`).join(", ")}\n`;
}

describe("blockersOf", () => {
  it("reads the marker line anywhere in the body", () => {
    expect(blockersOf(blockedBy(4, 5, 6))).toEqual([4, 5, 6]);
  });

  it("is empty when there is no marker", () => {
    expect(blockersOf("No blockers here. Closes #9 is not a blocker.")).toEqual(
      [],
    );
  });
});

describe("unmetBlockers", () => {
  // The regression this module exists for: merging closes an issue WITHOUT clearing
  // `status:review`, so anything reading doneness off the label stalls the graph.
  it("treats a closed blocker as met even though it still wears status:review", () => {
    const blocker = issue(4, { state: "CLOSED", labels: ["status:review"] });
    const child = issue(5, { body: blockedBy(4), labels: ["status:blocked"] });

    expect(unmetBlockers(child, [blocker, child])).toEqual([]);
    expect(readyList([blocker, child]).map((i) => i.number)).toEqual([5]);
  });

  it("keeps an OPEN blocker in review blocking — its PR has not merged", () => {
    const blocker = issue(4, { labels: ["status:review"] });
    const child = issue(5, { body: blockedBy(4) });

    expect(unmetBlockers(child, [blocker, child])).toEqual([4]);
    expect(readyList([blocker, child]).map((i) => i.number)).toEqual([4]);
  });

  it("blocks on a reference to an issue that is not in the dump at all", () => {
    const child = issue(5, { body: blockedBy(99) });
    expect(unmetBlockers(child, [child])).toEqual([99]);
  });

  it("reports only the blockers still open", () => {
    const issues = [
      issue(1, { state: "CLOSED" }),
      issue(2),
      issue(3, { body: blockedBy(1, 2) }),
    ];
    expect(unmetBlockers(issues[2], issues)).toEqual([2]);
  });
});

describe("readyList", () => {
  it("ignores the status:blocked label once the blockers are closed", () => {
    const issues = [
      issue(1, { state: "CLOSED", labels: ["status:review"] }),
      issue(2, { body: blockedBy(1), labels: ["status:blocked"] }),
    ];
    expect(readyList(issues).map((i) => i.number)).toEqual([2]);
  });

  it("skips assigned and in-progress tickets, and closed ones", () => {
    const issues = [
      issue(1, { assignees: ["someone"] }),
      issue(2, { labels: ["status:in-progress"] }),
      issue(3, { state: "CLOSED" }),
      issue(4),
    ];
    expect(readyList(issues).map((i) => i.number)).toEqual([4]);
  });

  it("orders by issue number, lowest first", () => {
    const issues = [issue(31), issue(5), issue(9)];
    expect(readyList(issues).map((i) => i.number)).toEqual([5, 9, 31]);
  });
});

describe("displayStateOf", () => {
  it("shows a stale status:blocked ticket as ready", () => {
    const issues = [
      issue(1, { state: "CLOSED", labels: ["status:review"] }),
      issue(2, { body: blockedBy(1), labels: ["status:blocked"] }),
    ];
    expect(displayStateOf(issues[1], issues)).toBe("ready");
  });

  it("shows blocked for an unlabelled ticket with an open blocker", () => {
    const issues = [issue(1), issue(2, { body: blockedBy(1) })];
    expect(displayStateOf(issues[1], issues)).toBe("blocked");
  });

  it("keeps in-progress and review over the computed state", () => {
    const issues = [
      issue(1),
      issue(2, { body: blockedBy(1), labels: ["status:in-progress"] }),
      issue(3, { labels: ["status:review"] }),
    ];
    expect(displayStateOf(issues[1], issues)).toBe("in-progress");
    expect(displayStateOf(issues[2], issues)).toBe("review");
  });
});

describe("labelsFor", () => {
  it("replaces the status label and keeps every other one", () => {
    const target = issue(1, {
      labels: ["epic:world", "size:m", "status:blocked"],
    });
    expect(labelsFor(target, "in-progress")).toEqual([
      "epic:world",
      "size:m",
      "status:in-progress",
    ]);
  });

  it("rejects a status that is not in the vocabulary", () => {
    expect(() => labelsFor(issue(1), "done")).toThrow(/Unknown status/);
  });

  it("refuses to write the retired status:blocked", () => {
    expect(() => labelsFor(issue(1), "blocked")).toThrow(/retired/);
  });

  it("strips a retired status:blocked without being asked to", () => {
    const target = issue(1, { labels: ["epic:world", "status:blocked"] });
    expect(labelsFor(target, "review")).toEqual([
      "epic:world",
      "status:review",
    ]);
  });
});

describe("isDocsOnly", () => {
  it("is true when every changed path is markdown", () => {
    expect(isDocsOnly(["docs/SPEC.md", "CLAUDE.md"])).toBe(true);
  });

  it("is false as soon as one path is not markdown", () => {
    expect(isDocsOnly(["docs/SPEC.md", "src/game/tiles.ts"])).toBe(false);
  });

  it("is false for an empty diff — nothing to reason about", () => {
    expect(isDocsOnly([])).toBe(false);
  });
});

describe("normalizeIssue", () => {
  it("accepts the REST/MCP shape: lowercase state, object labels", () => {
    const raw = {
      number: 7,
      title: "t",
      state: "closed",
      labels: [{ name: "size:l" }],
      assignees: [{ login: "someone" }],
    };
    expect(normalizeIssue(raw)).toEqual({
      number: 7,
      title: "t",
      body: "",
      labels: [{ name: "size:l" }],
      assignees: [{ login: "someone" }],
      state: "CLOSED",
    });
  });
});

describe("heartbeats", () => {
  const beat = (
    id,
    { agent = "a1b2c3", at = "2026-07-30T12:00:00Z" } = {},
  ) => ({
    id,
    updated_at: at,
    body: heartbeatBody({
      agent,
      branch: `claude/ticket-12-${agent}`,
      doing: "implementing",
      at,
    }),
  });

  it("round-trips through the comment body", () => {
    expect(parseHeartbeat(beat(100))).toEqual({
      id: 100,
      agent: "a1b2c3",
      branch: "claude/ticket-12-a1b2c3",
      doing: "implementing",
      updatedAt: "2026-07-30T12:00:00Z",
    });
  });

  it("ignores every comment that is not one", () => {
    expect(
      parseHeartbeat({ id: 1, body: "PR: http://example.com" }),
    ).toBeNull();
    expect(parseHeartbeat({ id: 2 })).toBeNull();
  });

  // The whole point of arbitrating on the id: one shared gh login means the assignee
  // cannot tell two racing agents apart, and `created_at` is only second-granular.
  it("gives the ticket to the LOWEST comment id when two agents raced", () => {
    const holder = heartbeatHolder([
      beat(205, { agent: "second" }),
      beat(204, { agent: "first" }),
    ]);
    expect(holder.agent).toBe("first");
  });

  it("has no holder when nothing has beaten", () => {
    expect(heartbeatHolder([{ id: 1, body: "PR: x" }])).toBeNull();
  });

  it("reads staleness off the timestamp GitHub stamped, not one we wrote", () => {
    const now = Date.parse("2026-07-30T12:00:00Z");
    expect(isStale("2026-07-30T11:55:00Z", now)).toBe(false);
    expect(isStale("2026-07-30T11:39:00Z", now)).toBe(true);
  });
});

describe("mainStatus", () => {
  const run = (conclusion, { status = "completed", sha = "abc" } = {}) => ({
    status,
    conclusion,
    headSha: sha,
    url: `https://example.com/${sha}`,
  });

  it("is green on the newest decided success", () => {
    expect(mainStatus([run("success"), run("failure")]).state).toBe("green");
  });

  // The false alarm this function exists for: only ONE run may be pending per
  // concurrency group, so a third merge cancels the second's queued deploy. That is
  // not a break and it owns nothing.
  it("reads a cancelled run as superseded, never as red", () => {
    const status = mainStatus([run("cancelled"), run("success")]);
    expect(status.state).toBe("green");
    expect(status.owner).toBeNull();
  });

  it("is red on a failure, and blames the EARLIEST consecutive one", () => {
    const status = mainStatus([
      run("failure", { sha: "piled-on" }),
      run("failure", { sha: "broke-it" }),
      run("success", { sha: "was-fine" }),
    ]);
    expect(status.state).toBe("red");
    expect(status.owner.headSha).toBe("broke-it");
  });

  it("does not let a cancelled run break the blame chain", () => {
    const status = mainStatus([
      run("failure", { sha: "piled-on" }),
      run("cancelled", { sha: "superseded" }),
      run("failure", { sha: "broke-it" }),
      run("success"),
    ]);
    expect(status.owner.headSha).toBe("broke-it");
  });

  it("is running while a deploy is in flight over a green tree", () => {
    const status = mainStatus([
      run(null, { status: "in_progress" }),
      run("success"),
    ]);
    expect(status.state).toBe("running");
  });

  it("stays red while the fix deploys, and says a run is in flight", () => {
    const status = mainStatus([
      run(null, { status: "in_progress" }),
      run("failure", { sha: "broke-it" }),
    ]);
    expect(status.state).toBe("red");
    expect(status.running).toBe(true);
  });
});

describe("normalizePatch", () => {
  it("drops the blob hashes two bases disagree on and keeps the rest", () => {
    const before =
      "--- a/x.ts\nindex 1111111..2222222 100644\n+++ b/x.ts\n+same";
    const after =
      "--- a/x.ts\nindex 9999999..8888888 100644\n+++ b/x.ts\n+same";
    expect(normalizePatch(before)).toBe(normalizePatch(after));
  });

  it("still sees a real difference", () => {
    expect(normalizePatch("+one")).not.toBe(normalizePatch("+two"));
  });
});
