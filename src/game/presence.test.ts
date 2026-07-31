import { describe, expect, it } from "vitest";
import { MAP_H, MAP_W } from "@shared/map";
import type { PresencePlayer } from "@shared/presence";
import {
  applyPresence,
  lcdLabel,
  nameLabel,
  remoteGain,
  remoteStep,
  type Roster,
} from "@/game/presence";
import { SPEECH_MS } from "@/game/speech";
import { STEP_MS } from "@/game/stride";

function player(
  id: string,
  name: string,
  x: number,
  y: number,
  sprite: string | null = null,
): PresencePlayer {
  return { id, name, x, y, facing: "down", sprite };
}

const TESTER = player("sock-1", "tester", 4, 4);
const RIVAL = player("sock-2", "rival", 2, 6);

function after(events: Parameters<typeof applyPresence>[1][], now = 0): Roster {
  return events.reduce<Roster>(
    (roster, event) => applyPresence(roster, event, now),
    new Map(),
  );
}

describe("applyPresence", () => {
  it("takes the whole roster from the frame sent on arrival", () => {
    const roster = after([{ type: "presence_here", players: [TESTER, RIVAL] }]);
    expect([...roster.keys()]).toEqual(["sock-1", "sock-2"]);
    expect(roster.get("sock-1")).toEqual({
      ...TESTER,
      stride: null,
      speech: null,
    });
  });

  it("strides somebody already on the map from where they were", () => {
    const roster = after(
      [
        { type: "presence_here", players: [TESTER] },
        {
          type: "presence_moved",
          player: { ...TESTER, x: 5, facing: "right" },
        },
      ],
      1000,
    );
    expect(roster.get("sock-1")).toEqual({
      ...TESTER,
      x: 5,
      facing: "right",
      stride: { fromX: 4, fromY: 4, start: 1000, ms: STEP_MS },
      speech: null,
    });
  });

  it("strides the door's two tiles as one move, like the local player", () => {
    const atDoor = player("sock-1", "tester", 2, 4);
    const roster = after([
      { type: "presence_here", players: [atDoor] },
      { type: "presence_moved", player: { ...atDoor, y: 2 } },
    ]);
    expect(roster.get("sock-1")?.stride?.ms).toBe(2 * STEP_MS);
  });

  it("stands a newcomer still rather than walking them in from nowhere", () => {
    const roster = after([{ type: "presence_moved", player: RIVAL }]);
    expect(roster.get("sock-2")).toEqual({
      ...RIVAL,
      stride: null,
      speech: null,
    });
  });

  it("carries what somebody is wearing, and a change of it with no step", () => {
    const wearing = "/api/sprites/0123456789abcdef";
    const roster = after([
      { type: "presence_here", players: [TESTER] },
      { type: "presence_moved", player: { ...TESTER, sprite: wearing } },
    ]);
    expect(roster.get("sock-1")?.sprite).toBe(wearing);
    expect(
      applyPresence(
        roster,
        { type: "presence_moved", player: { ...TESTER, sprite: null } },
        0,
      ).get("sock-1")?.sprite,
    ).toBeNull();
  });

  it("takes somebody off the map when their tab closes", () => {
    const roster = after([
      { type: "presence_here", players: [TESTER, RIVAL] },
      { type: "presence_left", id: "sock-2" },
    ]);
    expect([...roster.keys()]).toEqual(["sock-1"]);
  });

  it("hands back the same roster when there is nothing to change", () => {
    const roster = after([{ type: "presence_here", players: [TESTER] }]);
    expect(
      applyPresence(roster, { type: "presence_left", id: "gone" }, 0),
    ).toBe(roster);
    expect(applyPresence(roster, { type: "photo_created", id: 1 }, 0)).toBe(
      roster,
    );
  });
});

describe("applyPresence and what somebody said", () => {
  const SAID = {
    type: "presence_said",
    id: "sock-1",
    text: "hi there",
  } as const;

  it("hangs a message off the player it belongs to", () => {
    const roster = after(
      [{ type: "presence_here", players: [TESTER, RIVAL] }, SAID],
      1000,
    );
    expect(roster.get("sock-1")?.speech).toEqual({
      lines: ["HI THERE"],
      until: 1000 + SPEECH_MS,
    });
    expect(roster.get("sock-2")?.speech).toBeNull();
  });

  it("does not cut a sentence off when the speaker walks away", () => {
    const roster = after(
      [
        { type: "presence_here", players: [TESTER] },
        SAID,
        { type: "presence_moved", player: { ...TESTER, x: 5 } },
      ],
      1000,
    );
    expect(roster.get("sock-1")?.speech?.lines).toEqual(["HI THERE"]);
  });

  it("takes a bubble away with the player who left", () => {
    const roster = after([
      { type: "presence_here", players: [TESTER] },
      SAID,
      { type: "presence_left", id: "sock-1" },
    ]);
    expect(roster.has("sock-1")).toBe(false);
  });

  it("ignores a message from somebody who is not on the map", () => {
    const roster = after([{ type: "presence_here", players: [TESTER] }]);
    expect(
      applyPresence(
        roster,
        { type: "presence_said", id: "ghost", text: "?" },
        0,
      ),
    ).toBe(roster);
  });
});

describe("nameLabel", () => {
  it("shouts, because the pixel font has no lowercase", () => {
    expect(nameLabel("tester")).toBe("TESTER");
  });

  it("truncates a long name rather than papering over the map", () => {
    expect(nameLabel("bartholomew")).toBe("BARTHO");
  });
});

describe("lcdLabel", () => {
  it("is just the world when you are alone in it", () => {
    expect(lcdLabel([])).toBe("Overworld");
  });

  it("names the company, since the canvas is all there is to read", () => {
    expect(lcdLabel(["rival"])).toBe("Overworld — with rival");
    expect(lcdLabel(["rival", "voter"])).toBe("Overworld — with rival, voter");
  });
});

describe("remoteStep", () => {
  const HERE: Roster = new Map([
    ["sock-1", { ...TESTER, stride: null, speech: null }],
  ]);

  it("is the tile somebody left and the one they landed on", () => {
    expect(
      remoteStep(HERE, {
        type: "presence_moved",
        player: { ...TESTER, x: 5 },
      }),
    ).toEqual({ from: { x: 4, y: 4 }, to: { x: 5, y: 4 }, door: false });
  });

  it("is silent for the keep-alive repeat", () => {
    // `PRESENCE_PING_MS` re-sends an identical position every twenty seconds. A
    // footstep for each of those is a phantom step per idle friend, forever.
    expect(remoteStep(HERE, { type: "presence_moved", player: TESTER })).toBe(
      null,
    );
  });

  it("is silent for the roster a joining client is greeted with", () => {
    expect(
      remoteStep(HERE, { type: "presence_here", players: [TESTER, RIVAL] }),
    ).toBeNull();
  });

  it("is silent for somebody nobody has seen before", () => {
    expect(
      remoteStep(HERE, { type: "presence_moved", player: RIVAL }),
    ).toBeNull();
  });

  it("is silent for everything that is not somebody walking", () => {
    expect(
      remoteStep(HERE, { type: "presence_left", id: "sock-1" }),
    ).toBeNull();
    expect(remoteStep(HERE, { type: "photo_created", id: 1 })).toBeNull();
  });

  it("hears the door in the one step that goes through it", () => {
    const atDoor: Roster = new Map([
      [
        "sock-1",
        { ...player("sock-1", "tester", 2, 4), stride: null, speech: null },
      ],
    ]);
    expect(
      remoteStep(atDoor, {
        type: "presence_moved",
        player: player("sock-1", "tester", 2, 2),
      }),
    ).toEqual({ from: { x: 2, y: 4 }, to: { x: 2, y: 2 }, door: true });
  });
});

describe("remoteGain", () => {
  const CORNER = { x: 0, y: 0 };
  const FAR_CORNER = { x: MAP_W - 1, y: MAP_H - 1 };

  it("is full volume for somebody on your own tile", () => {
    expect(remoteGain(CORNER, CORNER)).toBe(1);
  });

  it("is at its quietest across the whole screen", () => {
    const across = remoteGain(CORNER, FAR_CORNER);
    expect(across).toBeGreaterThan(0);
    expect(across).toBeLessThan(0.5);
    expect(remoteGain(FAR_CORNER, CORNER)).toBeCloseTo(across);
  });

  it("falls off with distance and never climbs back", () => {
    const heard = [0, 2, 4, 6, 8].map((x) => remoteGain(CORNER, { x, y: 0 }));
    expect(heard).toEqual([...heard].sort((a, b) => b - a));
    expect(new Set(heard).size).toBe(heard.length);
  });

  it("clamps rather than inverting for a coordinate off the map", () => {
    expect(remoteGain(CORNER, { x: 99, y: 99 })).toBe(
      remoteGain(CORNER, FAR_CORNER),
    );
  });
});
