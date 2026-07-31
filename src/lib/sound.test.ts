import { isWalkableTile, MAP_ROWS } from "@shared/map";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STEP_MS } from "@/game/stride";
import {
  CUES,
  envelope,
  footstepCue,
  footstepPitch,
  isMuted,
  type Note,
  notesOf,
  setMuted,
} from "@/lib/sound";

// `localStorage` does not exist in the Node test runtime, and the sound module
// reads it lazily precisely so a fake can stand in here. One shared map, so a
// re-imported module sees what the previous one wrote — which is what "persists
// across a reload" means.
const stored = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string): string | null => stored.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      stored.set(key, value);
    },
  },
});

const EVERY_NOTE: [string, Note][] = Object.entries(CUES).flatMap(
  ([name, cue]) =>
    notesOf(cue).map(({ note }, index): [string, Note] => [
      `${name}[${index}]`,
      note,
    ]),
);

function duration(name: keyof typeof CUES): number {
  return notesOf(CUES[name]).reduce(
    (total, { note }) => total + note.seconds,
    0,
  );
}

const SURFACES = [".", "t", "P", "F", "s", "f"];

const WALKED_ON = [...new Set(MAP_ROWS.join("").split(""))]
  .filter(isWalkableTile)
  .sort();

describe("the cue table", () => {
  it("describes the wired-up cues and no unplayed ones", () => {
    expect(Object.keys(CUES).sort()).toEqual([
      "blip",
      "bump",
      "confirm",
      "door",
      "fanfare",
      "start",
      "stepFloor",
      "stepGrass",
      "stepPath",
      "stepSand",
      "stepTallGrass",
      "tick",
      "wheelTick",
    ]);
  });

  it("fits the countdown's tick inside the second it counts off", () => {
    expect(duration("tick")).toBeLessThan(0.5);
    const [first, ...rest] = notesOf(CUES.tick);
    expect(rest).toEqual([]);
    expect(first?.note.wave).toBe("square");
  });

  it("keeps every note short, audible and quiet", () => {
    for (const [name, note] of EVERY_NOTE) {
      expect(note.seconds, name).toBeGreaterThan(0);
      expect(note.seconds, name).toBeLessThan(0.2);
      expect(note.peak, name).toBeGreaterThan(0);
      expect(note.peak, name).toBeLessThanOrEqual(0.55);
    }
  });

  it("sweeps between pitches a Game Boy speaker can reproduce", () => {
    for (const [name, note] of EVERY_NOTE) {
      for (const hz of [note.from, note.to]) {
        expect(hz, name).toBeGreaterThan(50);
        expect(hz, name).toBeLessThan(note.wave === "noise" ? 6000 : 4000);
      }
    }
  });

  it("spends most of every note decaying, so nothing sounds like a drone", () => {
    for (const [name, note] of EVERY_NOTE) {
      expect(note.attack, name).toBeGreaterThan(0);
      expect(note.attack, name).toBeLessThanOrEqual(0.55);
    }
  });

  it("gives a filter band to the noise notes and to nothing else", () => {
    for (const [name, note] of EVERY_NOTE) {
      if (note.wave === "noise") expect(note.q, name).toBeGreaterThan(0);
      else expect(note.q, name).toBeUndefined();
    }
  });

  it("keeps a footstep inside a single step of walking", () => {
    for (const surface of SURFACES) {
      const cue = footstepCue(surface);
      expect(duration(cue), cue).toBeLessThan(0.15);
    }
  });

  it("makes the door a creaking hinge rather than one hiss", () => {
    const notes = notesOf(CUES.door);
    expect(notes.length).toBeGreaterThan(1);
    expect(notes.every(({ note }) => note.wave === "noise")).toBe(true);
    for (const { note } of notes) {
      expect(note.q ?? 0).toBeGreaterThan(10);
    }
    const rises = notes.map(({ note }) => note.to - note.from);
    expect(rises.every((rise) => rise > 0)).toBe(true);
    notes.forEach(({ note }, index) => {
      const before = notes[index - 1]?.note;
      if (before === undefined) return;
      expect(note.from).toBeGreaterThan(before.from);
      expect(note.from).toBeLessThan(before.to);
    });
  });

  it("finishes the creak inside the stride it opens", () => {
    expect(duration("door")).toBeLessThan((2 * STEP_MS) / 1000);
  });

  it("lets START be a phrase, since it answers the press that matters", () => {
    const pitches = notesOf(CUES.start).map(({ note }) => note.from);
    expect(pitches).toHaveLength(4);
    expect(duration("start")).toBeGreaterThan(duration("confirm"));
    expect(pitches).toEqual([...pitches].sort((a, b) => a - b));
    expect(new Set(pitches).size).toBe(pitches.length);
  });
});

describe("footstepCue", () => {
  it("has a surface for every walkable tile the map places", () => {
    // Without this a terrain type that becomes walkable silently sounds like
    // grass. `SURFACE_CUES` is keyed by the walkable union, so the compiler
    // catches the same mistake first — this is the regression half.
    expect(WALKED_ON).toEqual([...SURFACES].sort());
    for (const tile of WALKED_ON) {
      expect(CUES, `tile "${tile}"`).toHaveProperty(footstepCue(tile));
    }
  });

  it("makes five audibly different footsteps", () => {
    const cues = new Set(SURFACES.map(footstepCue));
    expect(cues.size).toBe(5);
    const sounds = [...cues].map((cue) =>
      notesOf(CUES[cue])
        .map(({ note }) => `${note.wave}:${note.from}-${note.to}`)
        .join("+"),
    );
    expect(new Set(sounds).size).toBe(5);
  });

  it("groups the two grasses and keeps the floorboards apart", () => {
    expect(footstepCue("F")).toBe(footstepCue("."));
    expect(footstepCue("t")).not.toBe(footstepCue("."));
    const floor = notesOf(CUES[footstepCue("f")]);
    expect(floor.every(({ note }) => note.wave !== "noise")).toBe(true);
  });

  it("falls back to grass off the walkable set, where nobody can stand", () => {
    expect(footstepCue("T")).toBe(footstepCue("."));
    expect(footstepCue("")).toBe(footstepCue("."));
  });
});

describe("notesOf", () => {
  it("reads a single-note cue as one note at the start of the cue", () => {
    expect(notesOf(CUES.bump)).toEqual([{ note: CUES.bump, at: 0 }]);
  });

  it("lays a sequence end to end", () => {
    let expected = 0;
    for (const { note, at } of notesOf(CUES.start)) {
      expect(at).toBeCloseTo(expected);
      expected += note.seconds;
    }
    expect(expected).toBeCloseTo(duration("start"));
  });

  it("never schedules a note before the cue it belongs to", () => {
    for (const [name, cue] of Object.entries(CUES)) {
      const offsets = notesOf(cue).map(({ at }) => at);
      expect(offsets, name).toEqual([...offsets].sort((a, b) => a - b));
      expect(offsets.at(0), name).toBe(0);
    }
  });
});

describe("envelope", () => {
  it("opens and closes on silence", () => {
    for (const [name, note] of EVERY_NOTE) {
      const points = envelope(note);
      expect(points.at(0), name).toEqual({ time: 0, gain: 0 });
      expect(points.at(-1), name).toEqual({ time: note.seconds, gain: 0 });
    }
  });

  it("peaks once, partway in", () => {
    expect(
      envelope({
        wave: "square",
        from: 400,
        to: 200,
        seconds: 0.1,
        peak: 0.5,
        attack: 0.25,
      }),
    ).toEqual([
      { time: 0, gain: 0 },
      { time: 0.025, gain: 0.5 },
      { time: 0.1, gain: 0 },
    ]);
  });

  it("only ever moves forward in time", () => {
    for (const [name, note] of EVERY_NOTE) {
      const times = envelope(note).map((point) => point.time);
      expect(times, name).toEqual([...times].sort((a, b) => a - b));
    }
  });

  it("never asks for a gain the master volume cannot hold", () => {
    for (const [name, note] of EVERY_NOTE) {
      for (const point of envelope(note)) {
        expect(point.gain, name).toBeGreaterThanOrEqual(0);
        expect(point.gain, name).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("footstepPitch", () => {
  it("alternates between two pitches", () => {
    const walk = [0, 1, 2, 3, 4].map(footstepPitch);
    expect(walk[0]).toBe(walk[2]);
    expect(walk[0]).toBe(walk[4]);
    expect(walk[1]).toBe(walk[3]);
    expect(walk[0]).not.toBe(walk[1]);
  });

  it("shifts by a hair, not into a different sound", () => {
    for (const step of [0, 1]) {
      expect(Math.abs(footstepPitch(step) - 1)).toBeLessThan(0.15);
    }
  });
});

describe("the mute flag", () => {
  beforeEach(() => {
    stored.clear();
    vi.resetModules();
  });

  it("starts unmuted — on, but quiet", () => {
    expect(isMuted()).toBe(false);
  });

  it("survives a reload once it is set", async () => {
    setMuted(true);
    expect(isMuted()).toBe(true);

    const reloaded = await import("@/lib/sound");
    expect(reloaded.isMuted()).toBe(true);
  });

  it("survives a reload when it is turned back off", async () => {
    setMuted(true);
    setMuted(false);

    const reloaded = await import("@/lib/sound");
    expect(reloaded.isMuted()).toBe(false);
  });
});
