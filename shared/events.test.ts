import { describe, expect, it } from "vitest";
import {
  beastProgress,
  BEAST_MS,
  countdownEvent,
  countdownSeconds,
  eventStateSchema,
  firstPodiumRank,
  HOST_IDLE_MS,
  idleEvent,
  isAwaitingHost,
  isBeastOn,
  isEventRunning,
  nextDeadline,
  nextPodiumStage,
  paradeEndsAt,
  PARADE_MS,
  paradeIndex,
  PODIUM_DEPTH,
  podiumAdvanceEvent,
  podiumEvent,
  PODIUM_STEP_MS,
  revealEvent,
  revealStage,
  SCOREBOARD_STAGE,
  spunEvent,
  wheelEndsAt,
  wheelEvent,
  wheelProgress,
  WHEEL_SPIN_MS,
  type EventState,
} from "./events";

const DAY = 3;

const HOST = 11;

function stateFrom(draft: object): EventState {
  return eventStateSchema.parse({ ...draft, day: DAY });
}

describe("idleEvent", () => {
  it("is normal play with nothing left over from an event", () => {
    expect(stateFrom(idleEvent())).toEqual({
      phase: "submission",
      day: DAY,
      countdownEndsAt: null,
      revealStartedAt: null,
      revealPhotoIds: [],
      winnerPhotoId: null,
      winnerUserId: null,
      hostUserId: null,
      podiumRank: null,
      podiumNextAt: null,
      stageEndsAt: null,
      spunAt: null,
      prizeIndex: null,
      segments: [],
      bowser: false,
      beastEndsAt: null,
    });
  });
});

describe("countdownEvent", () => {
  it("targets an absolute moment ahead of now, so clients render it locally", () => {
    const now = 1_700_000_000_000;
    const event = stateFrom(countdownEvent(now, HOST));
    expect(event.phase).toBe("countdown");
    expect(event.countdownEndsAt).toBeGreaterThan(now);
  });

  it("freezes the host at the start, before there is anything for them to do", () => {
    expect(stateFrom(countdownEvent(1, HOST)).hostUserId).toBe(HOST);
  });

  it("carries no winner and no wheel yet — those are later phases' business", () => {
    const event = stateFrom(countdownEvent(1_700_000_000_000, HOST));
    expect(event.winnerPhotoId).toBeNull();
    expect(event.prizeIndex).toBeNull();
    expect(event.segments).toEqual([]);
    expect(event.podiumRank).toBeNull();
  });
});

describe("countdownSeconds", () => {
  const NOW = 1_700_000_000_000;

  it("is the whole second still to run, so the last one reads 1", () => {
    expect(countdownSeconds(NOW + 10_000, NOW)).toBe(10);
    expect(countdownSeconds(NOW + 9_999, NOW)).toBe(10);
    expect(countdownSeconds(NOW + 9_001, NOW)).toBe(10);
    expect(countdownSeconds(NOW + 9_000, NOW)).toBe(9);
    expect(countdownSeconds(NOW + 1, NOW)).toBe(1);
  });

  it("gives one answer per moment, whoever is asking and whenever they arrived", () => {
    const endsAt = countdownEvent(NOW, HOST).countdownEndsAt;
    expect(countdownSeconds(endsAt, NOW)).toBe(10);
    expect(countdownSeconds(endsAt, NOW + 7_000)).toBe(3);
    expect(countdownSeconds(endsAt, NOW + 7_400)).toBe(3);
  });

  it("stops at zero rather than running negative, and waits there", () => {
    expect(countdownSeconds(NOW, NOW)).toBe(0);
    expect(countdownSeconds(NOW - 1, NOW)).toBe(0);
    expect(countdownSeconds(NOW - 60_000, NOW)).toBe(0);
  });

  it("has nothing to say without a target", () => {
    expect(countdownSeconds(null, NOW)).toBeNull();
    expect(countdownSeconds(idleEvent().countdownEndsAt, NOW)).toBeNull();
  });

  it("counts the podium's build-up off its own target", () => {
    const reveal = aReveal(NOW, [7, 5, 9]);
    const building = stateFrom(
      podiumAdvanceEvent(stateFrom(podiumEvent(reveal, 3, NOW)), NOW),
    );
    expect(countdownSeconds(building.podiumNextAt, NOW)).toBe(
      PODIUM_STEP_MS / 1000,
    );
    expect(countdownSeconds(building.podiumNextAt, NOW + 2_400)).toBe(1);
  });
});

function aReveal(now: number, photoIds: number[]): EventState {
  return stateFrom(
    revealEvent(
      now,
      {
        photoIds,
        winnerPhotoId: photoIds.at(-1) ?? null,
        winnerUserId: photoIds.length === 0 ? null : 4,
      },
      HOST,
    ),
  );
}

describe("revealEvent", () => {
  const NOW = 1_700_000_000_000;
  const OUTCOME = {
    photoIds: [7, 5, 9],
    winnerPhotoId: 9,
    winnerUserId: 4,
  };

  it("freezes the winner and the parade at the moment it opened", () => {
    const event = stateFrom(revealEvent(NOW, OUTCOME, HOST));
    expect(event.phase).toBe("reveal");
    expect(event.revealStartedAt).toBe(NOW);
    expect(event.revealPhotoIds).toEqual([7, 5, 9]);
    expect(event.winnerPhotoId).toBe(9);
    expect(event.winnerUserId).toBe(4);
    expect(event.segments).toEqual([]);
    expect(event.spunAt).toBeNull();
    expect(event.prizeIndex).toBeNull();
    expect(event.podiumRank).toBeNull();
  });

  it("carries the host across from the countdown rather than re-deriving one", () => {
    expect(stateFrom(revealEvent(NOW, OUTCOME, HOST)).hostUserId).toBe(HOST);
  });

  it("copies the ids rather than holding the caller's array", () => {
    const ids = [1, 2];
    const event = stateFrom(
      revealEvent(NOW, { ...OUTCOME, photoIds: ids }, HOST),
    );
    ids.push(3);
    expect(event.revealPhotoIds).toEqual([1, 2]);
  });

  it("takes an empty day, which is a day with no winner at all", () => {
    const event = stateFrom(
      revealEvent(
        NOW,
        { photoIds: [], winnerPhotoId: null, winnerUserId: null },
        HOST,
      ),
    );
    expect(event.revealPhotoIds).toEqual([]);
    expect(event.winnerUserId).toBeNull();
    expect(event.stageEndsAt).toBeGreaterThan(NOW);
    expect(nextDeadline(event)).toBe(event.stageEndsAt);
  });

  it("has nothing holding it open on a day that DOES have snaps", () => {
    const event = aReveal(NOW, [1, 2]);
    expect(event.stageEndsAt).toBeNull();
    expect(nextDeadline(event)).toBe(paradeEndsAt(event));
  });
});

describe("paradeIndex", () => {
  const NOW = 1_700_000_000_000;
  const reveal = aReveal(NOW, [7, 5, 9]);

  it("holds each snap for one PARADE_MS, in order", () => {
    expect(paradeIndex(reveal, NOW)).toBe(0);
    expect(paradeIndex(reveal, NOW + PARADE_MS - 1)).toBe(0);
    expect(paradeIndex(reveal, NOW + PARADE_MS)).toBe(1);
    expect(paradeIndex(reveal, NOW + 2 * PARADE_MS)).toBe(2);
  });

  it("puts a late arrival where the parade actually is", () => {
    expect(paradeIndex(reveal, NOW + 2 * PARADE_MS + 400)).toBe(2);
  });

  it("is null once the parade has walked them all — the podium is up", () => {
    expect(paradeIndex(reveal, NOW + 3 * PARADE_MS)).toBeNull();
    expect(paradeIndex(reveal, NOW + 60_000)).toBeNull();
  });

  it("is null with nothing to parade, and never before its own start", () => {
    expect(paradeIndex(stateFrom(idleEvent()), NOW)).toBeNull();
    expect(paradeIndex(reveal, NOW - 5_000)).toBe(0);
  });
});

describe("paradeEndsAt", () => {
  const NOW = 1_700_000_000_000;

  it("is one PARADE_MS per snap", () => {
    expect(paradeEndsAt(aReveal(NOW, [1, 2]))).toBe(NOW + 2 * PARADE_MS);
    expect(paradeEndsAt(aReveal(NOW, [1, 2, 3, 4]))).toBe(NOW + 4 * PARADE_MS);
  });

  it("has no answer when no reveal is running", () => {
    expect(paradeEndsAt(stateFrom(idleEvent()))).toBeNull();
  });
});

describe("firstPodiumRank", () => {
  it("opens on third place when the day has three or more snaps", () => {
    expect(firstPodiumRank(3)).toBe(PODIUM_DEPTH);
    expect(firstPodiumRank(14)).toBe(PODIUM_DEPTH);
  });

  it("opens on the worst rank a thin day actually has", () => {
    expect(firstPodiumRank(2)).toBe(2);
    expect(firstPodiumRank(1)).toBe(1);
  });

  it("has no podium at all for a day nobody submitted to", () => {
    expect(firstPodiumRank(0)).toBeNull();
  });
});

describe("podiumEvent", () => {
  const NOW = 1_700_000_000_000;
  const reveal = aReveal(NOW, [7, 5, 9]);

  it("puts one rank on screen and keeps everything the reveal froze", () => {
    const stage = stateFrom(podiumEvent(reveal, 3, NOW + 4_500));
    expect(stage.phase).toBe("reveal");
    expect(stage.podiumRank).toBe(3);
    expect(stage.podiumNextAt).toBeNull();
    expect(stage.winnerPhotoId).toBe(9);
    expect(stage.hostUserId).toBe(HOST);
    expect(stage.revealPhotoIds).toEqual([7, 5, 9]);
    expect(stage.revealStartedAt).toBe(NOW);
  });

  it("gives every stage the same moment for the DO to look up at", () => {
    for (const at of [3, 2, 1, SCOREBOARD_STAGE]) {
      const stage = stateFrom(podiumEvent(reveal, at, NOW));
      expect(stage.stageEndsAt).toBe(NOW + HOST_IDLE_MS);
    }
  });

  // #98's first reported bug, pinned. Rank 1 used to be given `CARD_HOLD_MS` and
  // then leave for the wheel with no press at all — the reveal ending without its
  // host, which is exactly "stages advanced without the host confirming".
  it("makes the winner's card wait for the host like every other stage", () => {
    const winner = stateFrom(podiumEvent(reveal, 1, NOW));
    expect(isAwaitingHost(winner)).toBe(true);
    expect(winner.stageEndsAt).toBe(NOW + HOST_IDLE_MS);
  });

  it("makes the scoreboard wait for the host too", () => {
    const board = stateFrom(podiumEvent(reveal, SCOREBOARD_STAGE, NOW));
    expect(board.podiumRank).toBe(SCOREBOARD_STAGE);
    expect(isAwaitingHost(board)).toBe(true);
    expect(board.winnerPhotoId).toBe(9);
    expect(board.hostUserId).toBe(HOST);
  });
});

describe("nextPodiumStage", () => {
  it("walks the ranks down, worst to best", () => {
    expect(nextPodiumStage(3)).toBe(2);
    expect(nextPodiumStage(2)).toBe(1);
  });

  it("ends the ranks on the day's whole scoreboard", () => {
    expect(nextPodiumStage(1)).toBe(SCOREBOARD_STAGE);
  });

  it("has nothing after the scoreboard: the reveal is over", () => {
    expect(nextPodiumStage(SCOREBOARD_STAGE)).toBeNull();
  });

  it("reaches the scoreboard from a two-snap day as well", () => {
    const first = firstPodiumRank(2);
    expect(first).toBe(2);
    expect(nextPodiumStage(first ?? 0)).toBe(1);
    expect(nextPodiumStage(1)).toBe(SCOREBOARD_STAGE);
  });
});

describe("revealStage", () => {
  const NOW = 1_700_000_000_000;
  const reveal = aReveal(NOW, [7, 5, 9]);

  it("parades the day's snaps off the reveal's own absolute start", () => {
    expect(revealStage(reveal, NOW)).toEqual({
      kind: "parade",
      at: 0,
      photoId: 7,
    });
    expect(revealStage(reveal, NOW + PARADE_MS)).toEqual({
      kind: "parade",
      at: 1,
      photoId: 5,
    });
  });

  it("settles between the last snap and the podium landing", () => {
    expect(revealStage(reveal, NOW + 3 * PARADE_MS)).toEqual({
      kind: "settling",
    });
  });

  // THE FIX. A client whose clock runs slow is still inside the parade's window
  // when the podium opens; before this it kept parading while everybody else was on
  // third place, because the clock-derived branch was checked first.
  it("renders the stage it was TOLD about, whatever its own clock says", () => {
    const stage = stateFrom(podiumEvent(reveal, 3, NOW + 3 * PARADE_MS));
    expect(paradeIndex(stage, NOW + PARADE_MS)).toBe(1);
    expect(revealStage(stage, NOW + PARADE_MS)).toEqual({
      kind: "podium",
      rank: 3,
    });
  });

  it("keeps the rank on screen through the build-up to the next one", () => {
    const building = stateFrom(
      podiumAdvanceEvent(stateFrom(podiumEvent(reveal, 3, NOW)), NOW),
    );
    expect(revealStage(building, NOW + PODIUM_STEP_MS - 1)).toEqual({
      kind: "podium",
      rank: 3,
    });
    expect(revealStage(building, NOW + PODIUM_STEP_MS + 5_000)).toEqual({
      kind: "podium",
      rank: 3,
    });
  });

  it("reads the zero as the scoreboard rather than as a rank", () => {
    const board = stateFrom(podiumEvent(reveal, SCOREBOARD_STAGE, NOW));
    expect(revealStage(board, NOW)).toEqual({ kind: "scoreboard" });
  });

  it("says a day nobody submitted to is empty, whatever the clock is doing", () => {
    const empty = aReveal(NOW, []);
    expect(revealStage(empty, NOW)).toEqual({ kind: "empty" });
    expect(revealStage(empty, NOW + 60_000)).toEqual({ kind: "empty" });
  });
});

describe("podiumAdvanceEvent", () => {
  const NOW = 1_700_000_000_000;
  const stage = stateFrom(podiumEvent(aReveal(NOW, [7, 5, 9]), 3, NOW));

  it("starts the build-up without turning the page itself", () => {
    const building = stateFrom(podiumAdvanceEvent(stage, NOW + 1_000));
    expect(building.podiumRank).toBe(3);
    expect(building.podiumNextAt).toBe(NOW + 1_000 + PODIUM_STEP_MS);
  });

  it("stops waiting for the host, because they have answered", () => {
    const building = stateFrom(podiumAdvanceEvent(stage, NOW));
    expect(isAwaitingHost(building)).toBe(false);
    expect(building.stageEndsAt).toBeNull();
  });
});

describe("isAwaitingHost", () => {
  const NOW = 1_700_000_000_000;
  const reveal = aReveal(NOW, [7, 5, 9]);

  it("is true on every stage the host has to move on", () => {
    for (const at of [3, 2, 1, SCOREBOARD_STAGE]) {
      expect(isAwaitingHost(stateFrom(podiumEvent(reveal, at, NOW)))).toBe(
        true,
      );
    }
  });

  it("is false where there is nothing for a host to press", () => {
    expect(isAwaitingHost(reveal)).toBe(false);
    expect(isAwaitingHost(stateFrom(idleEvent()))).toBe(false);
    const wheel = stateFrom(wheelEvent(reveal, ["a", "b"], NOW, false));
    expect(isAwaitingHost(wheel)).toBe(false);
    const building = stateFrom(
      podiumAdvanceEvent(stateFrom(podiumEvent(reveal, 2, NOW)), NOW),
    );
    expect(isAwaitingHost(building)).toBe(false);
  });
});

describe("wheelEvent", () => {
  const NOW = 1_700_000_000_000;

  it("snapshots the segments and carries the frozen winner across", () => {
    const reveal = aReveal(1, [9]);
    const wheel = stateFrom(wheelEvent(reveal, ["Bed", "Buddy"], NOW, false));
    expect(wheel.phase).toBe("wheel");
    expect(wheel.segments).toEqual(["Bed", "Buddy"]);
    expect(wheel.winnerPhotoId).toBe(9);
    expect(wheel.winnerUserId).toBe(4);
    expect(wheel.hostUserId).toBe(HOST);
    expect(wheel.revealStartedAt).toBeNull();
    expect(wheel.revealPhotoIds).toEqual([]);
    expect(wheel.podiumRank).toBeNull();
    expect(wheel.spunAt).toBeNull();
    expect(wheel.prizeIndex).toBeNull();
  });

  it("will not wait for its winner forever", () => {
    const wheel = stateFrom(
      wheelEvent(aReveal(1, [9]), ["a", "b"], NOW, false),
    );
    expect(wheel.stageEndsAt).toBe(NOW + HOST_IDLE_MS);
  });

  it("opens an ordinary day with no beast to play", () => {
    const wheel = stateFrom(
      wheelEvent(aReveal(1, [9]), ["a", "b"], NOW, false),
    );
    expect(wheel.bowser).toBe(false);
    expect(wheel.beastEndsAt).toBeNull();
    expect(isBeastOn(wheel, NOW)).toBe(false);
    expect(beastProgress(wheel, NOW)).toBe(1);
  });

  it("stamps the beast's moment on a Bowser day", () => {
    const wheel = stateFrom(wheelEvent(aReveal(1, [9]), ["a", "b"], NOW, true));
    expect(wheel.bowser).toBe(true);
    expect(wheel.beastEndsAt).toBe(NOW + BEAST_MS);
    expect(wheel.stageEndsAt).toBe(NOW + HOST_IDLE_MS);
  });
});

describe("the beast", () => {
  const NOW = 1_700_000_000_000;
  const beastly = stateFrom(
    wheelEvent(
      { winnerPhotoId: 9, winnerUserId: 4, hostUserId: HOST },
      ["Bowser bed", "Bowser bier"],
      NOW,
      true,
    ),
  );

  it("runs from its arrival to its moment, and is over after it", () => {
    expect(beastProgress(beastly, NOW)).toBe(0);
    expect(beastProgress(beastly, NOW + BEAST_MS / 2)).toBeCloseTo(0.5);
    expect(beastProgress(beastly, NOW + BEAST_MS)).toBe(1);
    expect(beastProgress(beastly, NOW + BEAST_MS * 10)).toBe(1);
  });

  // A screen that joined late renders the beast where everybody else is, because the
  // moment is absolute and the progress is read off the joiner's own clock.
  it("is on until its moment and not one tick after", () => {
    expect(isBeastOn(beastly, NOW)).toBe(true);
    expect(isBeastOn(beastly, NOW + BEAST_MS - 1)).toBe(true);
    expect(isBeastOn(beastly, NOW + BEAST_MS)).toBe(false);
  });

  it("keeps its moment and its wheel across the spin", () => {
    const spun = stateFrom(spunEvent(beastly, NOW + BEAST_MS + 1_000, 1));
    expect(spun.bowser).toBe(true);
    expect(spun.beastEndsAt).toBe(beastly.beastEndsAt);
    expect(spun.segments).toEqual(["Bowser bed", "Bowser bier"]);
    expect(isBeastOn(spun, NOW + BEAST_MS + 1_000)).toBe(false);
  });
});

describe("spunEvent", () => {
  const NOW = 1_700_000_000_000;
  const wheel = stateFrom(
    wheelEvent(
      { winnerPhotoId: 9, winnerUserId: 4, hostUserId: HOST },
      ["Bed", "Buddy", "Beer", "Bag"],
      NOW,
      false,
    ),
  );

  it("stamps the result and the moment, keeping the wheel it was spun on", () => {
    const spun = stateFrom(spunEvent(wheel, NOW, 2));
    expect(spun.phase).toBe("wheel");
    expect(spun.prizeIndex).toBe(2);
    expect(spun.spunAt).toBe(NOW);
    expect(spun.segments).toEqual(["Bed", "Buddy", "Beer", "Bag"]);
    expect(spun.winnerUserId).toBe(4);
  });

  it("drops the idle fallback, because nothing is waiting for anybody now", () => {
    expect(stateFrom(spunEvent(wheel, NOW, 2)).stageEndsAt).toBeNull();
  });

  it("eases from a standstill onto the segment and stops there", () => {
    const spun = stateFrom(spunEvent(wheel, NOW, 2));
    expect(wheelProgress(spun, NOW)).toBe(0);
    expect(wheelProgress(spun, NOW + WHEEL_SPIN_MS)).toBe(1);
    expect(wheelProgress(spun, NOW + WHEEL_SPIN_MS / 2)).toBeGreaterThan(0.5);
    expect(wheelProgress(spun, NOW + 60_000)).toBe(1);
  });

  it("has no progress to report on a wheel nobody has spun", () => {
    expect(wheelProgress(wheel, NOW)).toBe(0);
    expect(wheelEndsAt(wheel)).toBeNull();
  });
});

describe("nextDeadline", () => {
  const NOW = 1_700_000_000_000;

  it("is what ends the phase the event is in", () => {
    const countdown = stateFrom(countdownEvent(NOW, HOST));
    expect(nextDeadline(countdown)).toBe(countdown.countdownEndsAt);

    const reveal = aReveal(NOW, [1]);
    expect(nextDeadline(reveal)).toBe(paradeEndsAt(reveal));

    const spun = stateFrom(
      spunEvent(stateFrom(wheelEvent(reveal, ["a", "b"], NOW, false)), NOW, 1),
    );
    expect(nextDeadline(spun)).toBe(wheelEndsAt(spun));
  });

  it("is the build-up while the podium is moving, and the fallback while it waits", () => {
    const reveal = aReveal(NOW, [7, 5, 9]);
    const stage = stateFrom(podiumEvent(reveal, 3, NOW));
    expect(nextDeadline(stage)).toBe(stage.stageEndsAt);
    expect(nextDeadline(stage)).not.toBeNull();

    const building = stateFrom(podiumAdvanceEvent(stage, NOW));
    expect(nextDeadline(building)).toBe(building.podiumNextAt);
  });

  // The hang bug, pinned: an unspun wheel armed no alarm, the DO deleted the one
  // it had, and only an admin abort escaped — which does not advance the day.
  it("is never null on a wheel still waiting for its winner", () => {
    const wheel = stateFrom(
      wheelEvent(
        { winnerPhotoId: 1, winnerUserId: 2, hostUserId: HOST },
        ["a", "b"],
        NOW,
        false,
      ),
    );
    expect(wheel.spunAt).toBeNull();
    expect(nextDeadline(wheel)).toBe(NOW + HOST_IDLE_MS);
  });

  it("is nothing during normal play", () => {
    expect(nextDeadline(stateFrom(idleEvent()))).toBeNull();
  });

  it("is nothing for a phase carrying none of its own state", () => {
    for (const phase of ["countdown", "reveal", "wheel"]) {
      expect(nextDeadline(stateFrom({ ...idleEvent(), phase }))).toBeNull();
    }
  });
});

describe("isEventRunning", () => {
  it("is every phase but submission", () => {
    expect(isEventRunning(stateFrom(idleEvent()))).toBe(false);
    expect(isEventRunning(stateFrom(countdownEvent(1, HOST)))).toBe(true);
    for (const phase of ["reveal", "wheel"]) {
      expect(isEventRunning(stateFrom({ ...idleEvent(), phase }))).toBe(true);
    }
  });

  it("treats a state it has not got yet as nothing running", () => {
    expect(isEventRunning(undefined)).toBe(false);
  });
});
