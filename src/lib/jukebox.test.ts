import {
  RECORD_MAX_MS,
  startedRecord,
  type JukeboxState,
} from "@shared/jukebox";
import { describe, expect, it } from "vitest";
import { isCabinetLit, needleAt, recordCue } from "./jukebox";
import type { ShelfRecord } from "./shelf";

const START = 1_700_000_000_000;

const SHELF: ShelfRecord[] = [
  {
    id: "Nena - 99 Luftballons",
    artist: "Nena",
    title: "99 Luftballons",
    url: "/assets/nena-a1b2c3.mp3",
  },
];

const SILENT: JukeboxState = { playing: null };

function on(durationMs = 180_000, startedAt = START): JukeboxState {
  return {
    playing: startedRecord(
      { trackId: "Nena - 99 Luftballons", durationMs },
      startedAt,
    ),
  };
}

describe("recordCue", () => {
  it("plays nothing when nothing is on", () => {
    expect(recordCue(SHELF, SILENT, START, false)).toBeNull();
  });

  it("starts at the top of the record for the screen that put it on", () => {
    expect(recordCue(SHELF, on(), START, false)).toEqual({
      url: "/assets/nena-a1b2c3.mp3",
      offsetSeconds: 0,
    });
  });

  it("seeks a late joiner to where the town already is", () => {
    expect(recordCue(SHELF, on(), START + 62_500, false)?.offsetSeconds).toBe(
      62.5,
    );
  });

  it("plays nothing once the record is over", () => {
    expect(recordCue(SHELF, on(180_000), START + 180_000, false)).toBeNull();
  });

  it("is silenced by mute — a record is not a friend", () => {
    expect(recordCue(SHELF, on(), START, true)).toBeNull();
  });

  it("plays silence for a track id the shelf no longer has", () => {
    const stale: JukeboxState = {
      playing: startedRecord(
        { trackId: "Somebody - Deleted", durationMs: 60_000 },
        START,
      ),
    };
    expect(recordCue(SHELF, stale, START, false)).toBeNull();
  });

  it("plays nothing off an empty shelf", () => {
    expect(recordCue([], on(), START, false)).toBeNull();
  });
});

describe("isCabinetLit", () => {
  it("is dark with nothing on and lit while a record runs", () => {
    expect(isCabinetLit(SILENT, START)).toBe(false);
    expect(isCabinetLit(on(), START)).toBe(true);
    expect(isCabinetLit(on(), START + 179_999)).toBe(true);
  });

  it("goes dark the moment the record ends, leaving no lie on screen", () => {
    expect(isCabinetLit(on(180_000), START + 180_000)).toBe(false);
  });

  it("goes dark for a state left behind past the ceiling", () => {
    const forgotten: JukeboxState = {
      playing: {
        trackId: "Nena - 99 Luftballons",
        startedAt: START,
        endsAt: START + RECORD_MAX_MS * 10,
      },
    };
    expect(isCabinetLit(forgotten, START + RECORD_MAX_MS)).toBe(false);
  });

  it("is lit for a muted screen: the lights read the town, not this browser's audio", () => {
    const state = on();
    expect(recordCue(SHELF, state, START, true)).toBeNull();
    expect(isCabinetLit(state, START)).toBe(true);
  });
});

describe("needleAt", () => {
  it("parks when the town has nothing on, whatever this browser is doing", () => {
    expect(needleAt(SILENT, START, "silent")).toBe("parked");
    expect(needleAt(SILENT, START, "loading")).toBe("parked");
    expect(needleAt(SILENT, START, "playing")).toBe("parked");
  });

  it("cues while this screen is still downloading the record", () => {
    expect(needleAt(on(), START, "loading")).toBe("cueing");
  });

  it("turns for a screen the town says is playing", () => {
    expect(needleAt(on(), START, "playing")).toBe("playing");
  });

  it("turns for a MUTED screen too: the disc reads the town, not this browser's audio", () => {
    expect(needleAt(on(), START, "silent")).toBe("playing");
  });

  it("parks the moment the record ends, leaving no disc turning over silence", () => {
    expect(needleAt(on(180_000), START + 180_000, "playing")).toBe("parked");
  });
});
