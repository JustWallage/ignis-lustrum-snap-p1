import { describe, expect, it } from "vitest";
import {
  REVALIDATE_EVENT_TYPES,
  WS_EVENT_TYPES,
  wsEventSchema,
} from "./ws-events";

describe("WS_EVENT_TYPES", () => {
  it("covers every member of the event union", () => {
    expect(WS_EVENT_TYPES).toHaveLength(wsEventSchema.options.length);
    expect([...WS_EVENT_TYPES].sort()).toEqual([
      "avatar_changed",
      "comment_created",
      "comment_deleted",
      "event_changed",
      "photo_created",
      "photo_deleted",
      "photo_liked",
      "presence_here",
      "presence_jukebox",
      "presence_left",
      "presence_moved",
      "presence_said",
      "presence_talk_end",
      "presence_talk_start",
      "prizes_changed",
      "state_changed",
      "votes_changed",
    ]);
  });

  it("lists only types the schema actually discriminates on", () => {
    for (const type of WS_EVENT_TYPES) {
      const parsed = wsEventSchema.safeParse({ type });
      expect(
        parsed.error?.issues.map((issue) => issue.path) ?? [],
      ).not.toContain(["type"]);
    }
  });
});

describe("REVALIDATE_EVENT_TYPES", () => {
  it("is every event except presence", () => {
    expect([...REVALIDATE_EVENT_TYPES].sort()).toEqual([
      "avatar_changed",
      "comment_created",
      "comment_deleted",
      "event_changed",
      "photo_created",
      "photo_deleted",
      "photo_liked",
      "prizes_changed",
      "state_changed",
      "votes_changed",
    ]);
    expect(REVALIDATE_EVENT_TYPES).toHaveLength(WS_EVENT_TYPES.length - 7);
    expect(REVALIDATE_EVENT_TYPES).not.toContain("presence_jukebox");
  });
});

describe("wsEventSchema", () => {
  it("round-trips a state_changed event with its whole payload", () => {
    const event = {
      type: "state_changed",
      state: { day: 3, phase: "countdown", submissionCount: 7 },
    };
    expect(wsEventSchema.parse(event)).toEqual(event);
  });

  it("round-trips an event_changed event with its whole payload", () => {
    const event = {
      type: "event_changed",
      state: {
        phase: "countdown",
        day: 3,
        countdownEndsAt: 1_700_000_010_000,
        revealStartedAt: null,
        revealPhotoIds: [],
        winnerPhotoId: null,
        winnerUserId: null,
        hostUserId: 11,
        podiumRank: null,
        podiumNextAt: null,
        stageEndsAt: null,
        spunAt: null,
        prizeIndex: null,
        segments: [],
        bowser: false,
        beastEndsAt: null,
      },
    };
    expect(wsEventSchema.parse(event)).toEqual(event);
  });

  it("carries a message as a socket id and its text, and nothing else", () => {
    const event = { type: "presence_said", id: "sock-1", text: "HELLO" };
    expect(wsEventSchema.parse(event)).toEqual(event);
    expect(
      wsEventSchema.safeParse({ ...event, text: "A".repeat(500) }).success,
    ).toBe(false);
  });

  it("says who is transmitting on the way out, though the frame in says nobody", () => {
    const started = {
      type: "presence_talk_start",
      id: "sock-1",
      name: "tester",
    };
    expect(wsEventSchema.parse(started)).toEqual(started);
    const ended = { type: "presence_talk_end", id: "sock-1" };
    expect(wsEventSchema.parse({ ...ended, name: "tester" })).toEqual(ended);
  });

  it("carries what is playing and when it started, and nobody's name", () => {
    const event = {
      type: "presence_jukebox",
      jukebox: {
        playing: {
          trackId: "Nena - 99 Luftballons",
          startedAt: 1_700_000_000_000,
          endsAt: 1_700_000_180_000,
        },
      },
    };
    expect(wsEventSchema.parse(event)).toEqual(event);
    expect(
      wsEventSchema.parse({ ...event, userId: 4, name: "tester" }),
    ).toEqual(event);
    const silence = { type: "presence_jukebox", jukebox: { playing: null } };
    expect(wsEventSchema.parse(silence)).toEqual(silence);
  });

  it("rejects an unknown phase and an unknown event type", () => {
    expect(
      wsEventSchema.safeParse({
        type: "state_changed",
        state: { day: 1, phase: "brunch", submissionCount: 0 },
      }).success,
    ).toBe(false);
    expect(wsEventSchema.safeParse({ type: "day_changed" }).success).toBe(
      false,
    );
  });
});
