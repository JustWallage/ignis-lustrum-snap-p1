import { describe, expect, it } from "vitest";
import { applyChannel, CHANNEL_IDLE, type Channel } from "@/game/voice";

const THEIRS = {
  type: "presence_talk_start",
  id: "sock-1",
  name: "rival",
} as const;

const OVER = { type: "presence_talk_end", id: "sock-1" } as const;

function after(...actions: Parameters<typeof applyChannel>[1][]): Channel {
  return actions.reduce(applyChannel, CHANNEL_IDLE);
}

describe("the channel's three states", () => {
  it("is dark until somebody presses something", () => {
    expect(CHANNEL_IDLE).toEqual({ mine: false, theirs: null });
  });

  it("lights yours from the press, which is the only thing that can", () => {
    expect(after({ type: "mine_start" })).toEqual({
      mine: true,
      theirs: null,
    });
    expect(after({ type: "mine_start" }, { type: "mine_end" })).toEqual(
      CHANNEL_IDLE,
    );
  });

  it("names the friend on theirs, and lets go of them on the end frame", () => {
    expect(after(THEIRS)).toEqual({ mine: false, theirs: "rival" });
    expect(after(THEIRS, OVER)).toEqual(CHANNEL_IDLE);
  });

  it("renders both at once rather than garbage, though the transport forbids it", () => {
    expect(after({ type: "mine_start" }, THEIRS)).toEqual({
      mine: true,
      theirs: "rival",
    });
  });

  it("puts your own light out when the socket dies mid-press", () => {
    expect(
      after({ type: "mine_start" }, THEIRS, { type: "socket_lost" }),
    ).toEqual(CHANNEL_IDLE);
  });

  it("ignores everything that is not about the channel", () => {
    const held = applyChannel(CHANNEL_IDLE, { type: "mine_start" });
    expect(applyChannel(held, { type: "prizes_changed" })).toBe(held);
    expect(applyChannel(held, { type: "presence_left", id: "sock-1" })).toBe(
      held,
    );
  });

  it("hands back the same channel when nothing moved, so nothing re-renders", () => {
    const held = applyChannel(CHANNEL_IDLE, { type: "mine_start" });
    expect(applyChannel(held, { type: "mine_start" })).toBe(held);
    expect(applyChannel(CHANNEL_IDLE, OVER)).toBe(CHANNEL_IDLE);
    expect(applyChannel(CHANNEL_IDLE, { type: "socket_lost" })).toBe(
      CHANNEL_IDLE,
    );
  });
});
