import { z } from "zod";
import { gamePhaseSchema } from "./state";

export const eventStateSchema = z.object({
  phase: gamePhaseSchema,
  day: z.int().positive(),
  countdownEndsAt: z.int().positive().nullable(),
  revealStartedAt: z.int().positive().nullable(),
  revealPhotoIds: z.array(z.int()),
  winnerPhotoId: z.int().nullable(),
  winnerUserId: z.int().nullable(),
  hostUserId: z.int().nullable(),
  podiumRank: z.int().nonnegative().nullable(),
  podiumNextAt: z.int().positive().nullable(),
  /** TWO meanings, and only `RealtimeDO.alarm` tells them apart: for the wheel and the
   * empty-day card it is when the stage gives way; for a podium stage it is only when
   * the DO LOOKS UP, so it goes quietly stale while a host talks. */
  stageEndsAt: z.int().positive().nullable(),
  spunAt: z.int().positive().nullable(),
  prizeIndex: z.int().nonnegative().nullable(),
  segments: z.array(z.string()),
  bowser: z.boolean(),
  beastEndsAt: z.int().positive().nullable(),
});
export type EventState = z.infer<typeof eventStateSchema>;

export type EventDraft = Omit<EventState, "day">;

const COUNTDOWN_MS = 10_000;

export const PARADE_MS = 1_500;

export const PODIUM_DEPTH = 3;

export const SCOREBOARD_STAGE = 0;

export const PODIUM_STEP_MS = 3_000;

/** NOT "how long the host gets": a host reading a critique out loud passes ninety
 * seconds constantly, so for the podium this is a presence check that re-arms. For the
 * wheel it is a plain fallback. */
export const HOST_IDLE_MS = 90_000;

const CARD_HOLD_MS = 8_000;

export const WHEEL_SPIN_MS = 5_000;

const WHEEL_HOLD_MS = 20_000;

export const BEAST_MS = 6_000;

export function idleEvent(): EventDraft {
  return {
    phase: "submission",
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
  };
}

function draftOf(event: EventState): EventDraft {
  const { day: _day, ...draft } = event;
  return draft;
}

export function countdownEvent(
  now: number,
  hostUserId: number | null,
): EventDraft {
  return {
    ...idleEvent(),
    phase: "countdown",
    countdownEndsAt: now + COUNTDOWN_MS,
    hostUserId,
  };
}

export interface RevealOutcome {
  photoIds: readonly number[];
  winnerPhotoId: number | null;
  winnerUserId: number | null;
}

export function revealEvent(
  now: number,
  outcome: RevealOutcome,
  hostUserId: number | null,
): EventDraft {
  return {
    ...idleEvent(),
    phase: "reveal",
    revealStartedAt: now,
    revealPhotoIds: [...outcome.photoIds],
    winnerPhotoId: outcome.winnerPhotoId,
    winnerUserId: outcome.winnerUserId,
    hostUserId,
    stageEndsAt: outcome.photoIds.length === 0 ? now + CARD_HOLD_MS : null,
  };
}

export function firstPodiumRank(count: number): number | null {
  return count <= 0 ? null : Math.min(PODIUM_DEPTH, count);
}

export function podiumEvent(
  reveal: EventState,
  stage: number,
  now: number,
): EventDraft {
  return {
    ...draftOf(reveal),
    podiumRank: stage,
    podiumNextAt: null,
    stageEndsAt: now + HOST_IDLE_MS,
  };
}

export function nextPodiumStage(stage: number): number | null {
  if (stage > 1) return stage - 1;
  if (stage === 1) return SCOREBOARD_STAGE;
  return null;
}

export function podiumAdvanceEvent(
  reveal: EventState,
  now: number,
): EventDraft {
  return {
    ...draftOf(reveal),
    podiumNextAt: now + PODIUM_STEP_MS,
    stageEndsAt: null,
  };
}

export function wheelEvent(
  event: Pick<EventState, "winnerPhotoId" | "winnerUserId" | "hostUserId">,
  segments: readonly string[],
  now: number,
  bowser: boolean,
): EventDraft {
  return {
    ...idleEvent(),
    phase: "wheel",
    winnerPhotoId: event.winnerPhotoId,
    winnerUserId: event.winnerUserId,
    hostUserId: event.hostUserId,
    segments: [...segments],
    bowser,
    beastEndsAt: bowser ? now + BEAST_MS : null,
    // Without this an unspun wheel armed no alarm and hung until an admin
    // aborted it.
    stageEndsAt: now + HOST_IDLE_MS,
  };
}

export function spunEvent(
  wheel: EventState,
  now: number,
  prizeIndex: number,
): EventDraft {
  return {
    // This REBUILDS from `idleEvent()`, so anything the wheel is carrying is stated
    // again here or lost — the flag as an argument, and the beast's moment as a field,
    // because `wheelEvent` stamps that from the `now` it is handed and the press would
    // otherwise push it forward and replay the beast over the landing.
    ...wheelEvent(wheel, wheel.segments, now, wheel.bowser),
    beastEndsAt: wheel.beastEndsAt,
    spunAt: now,
    prizeIndex,
    stageEndsAt: null,
  };
}

export function beastProgress(event: EventState, now: number): number {
  const endsAt = event.beastEndsAt;
  if (endsAt === null) return 1;
  return Math.min(1, Math.max(0, 1 - (endsAt - now) / BEAST_MS));
}

export function isBeastOn(event: EventState, now: number): boolean {
  return event.beastEndsAt !== null && now < event.beastEndsAt;
}

export function countdownSeconds(
  endsAt: number | null,
  now: number,
): number | null {
  if (endsAt === null) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function paradeIndex(event: EventState, now: number): number | null {
  const startedAt = event.revealStartedAt;
  if (startedAt === null) return null;
  const index = Math.floor(Math.max(0, now - startedAt) / PARADE_MS);
  return index < event.revealPhotoIds.length ? index : null;
}

export function paradeEndsAt(event: EventState): number | null {
  const startedAt = event.revealStartedAt;
  if (startedAt === null) return null;
  return startedAt + event.revealPhotoIds.length * PARADE_MS;
}

export function wheelEndsAt(event: EventState): number | null {
  const spunAt = event.spunAt;
  if (spunAt === null) return null;
  return spunAt + WHEEL_SPIN_MS + WHEEL_HOLD_MS;
}

export function wheelProgress(event: EventState, now: number): number {
  const spunAt = event.spunAt;
  if (spunAt === null) return 0;
  const elapsed = Math.min(1, Math.max(0, (now - spunAt) / WHEEL_SPIN_MS));
  return 1 - (1 - elapsed) ** 3;
}

export function isAwaitingHost(event: EventState): boolean {
  return (
    event.phase === "reveal" &&
    event.podiumRank !== null &&
    event.podiumNextAt === null
  );
}

export type RevealStage =
  | { kind: "empty" }
  | { kind: "parade"; at: number; photoId: number }
  | { kind: "settling" }
  | { kind: "podium"; rank: number }
  | { kind: "scoreboard" };

/** The ORDER of these branches is load-bearing (#98): the published stage beats the
 * clock, because a skewed clock costs the parade a beat of a photograph but left a slow
 * client parading while everyone else was on third place. */
export function revealStage(event: EventState, now: number): RevealStage {
  if (event.revealPhotoIds.length === 0) return { kind: "empty" };
  const stage = event.podiumRank;
  if (stage !== null) {
    return stage === SCOREBOARD_STAGE
      ? { kind: "scoreboard" }
      : { kind: "podium", rank: stage };
  }
  const at = paradeIndex(event, now);
  const photoId = at === null ? undefined : event.revealPhotoIds[at];
  // `paradeIndex` only answers inside the list, so the undefined case is the
  // compiler being satisfied rather than a state that happens.
  if (at === null || photoId === undefined) return { kind: "settling" };
  return { kind: "parade", at, photoId };
}

/** The one number the DO arms its alarm for. Null is normal play and NOTHING else —
 * the two stages that wait for a person carry `stageEndsAt`. */
export function nextDeadline(event: EventState): number | null {
  switch (event.phase) {
    case "countdown":
      return event.countdownEndsAt;
    case "reveal":
      if (event.podiumRank !== null) {
        return event.podiumNextAt ?? event.stageEndsAt;
      }
      return event.revealPhotoIds.length === 0
        ? event.stageEndsAt
        : paradeEndsAt(event);
    case "wheel":
      return wheelEndsAt(event) ?? event.stageEndsAt;
    case "submission":
      return null;
  }
}

export function isEventRunning(event: EventState | undefined): boolean {
  return event !== undefined && event.phase !== "submission";
}

export function eventStageKey(event: EventState | undefined): string | null {
  if (event === undefined || event.phase === "submission") return null;
  return [
    event.phase,
    event.podiumRank,
    event.podiumNextAt,
    event.prizeIndex,
  ].join(":");
}
