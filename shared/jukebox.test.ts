import { describe, expect, it } from "vitest";
import {
  isPressTooSoon,
  jukeboxStateSchema,
  nowPlaying,
  putRecordSchema,
  RECORD_MAX_MS,
  SILENT,
  startedRecord,
  trackNameOf,
  type JukeboxState,
} from "./jukebox";

const START = 1_700_000_000_000;

function playing(durationMs: number, startedAt = START): JukeboxState {
  return {
    playing: startedRecord(
      { trackId: "Nena - 99 Luftballons", durationMs },
      startedAt,
    ),
  };
}

describe("trackNameOf", () => {
  it("splits artist from title on the first separator", () => {
    expect(trackNameOf("Nena - 99 Luftballons.mp3")).toEqual({
      id: "Nena - 99 Luftballons",
      artist: "Nena",
      title: "99 Luftballons",
    });
  });

  it("keeps every later separator in the title", () => {
    expect(trackNameOf("Sly - Family - Stone.mp3")).toMatchObject({
      artist: "Sly",
      title: "Family - Stone",
    });
  });

  it("reads a stem with no separator as all title and no artist", () => {
    expect(trackNameOf("Tusk.mp3")).toEqual({
      id: "Tusk",
      artist: null,
      title: "Tusk",
    });
  });

  it("keeps an apostrophe and an accent as themselves", () => {
    expect(trackNameOf("Beyoncé - Don't Hurt Yourself.mp3")).toEqual({
      id: "Beyoncé - Don't Hurt Yourself",
      artist: "Beyoncé",
      title: "Don't Hurt Yourself",
    });
  });

  it("strips whatever extension it is handed, and copes with none", () => {
    expect(trackNameOf("Prince - Kiss.opus").id).toBe("Prince - Kiss");
    expect(trackNameOf("Prince - Kiss.weird").id).toBe("Prince - Kiss");
    expect(trackNameOf("Prince - Kiss").id).toBe("Prince - Kiss");
  });

  it("keeps the dots inside a title and drops only the last one", () => {
    expect(trackNameOf("Blur - Song 2.5.mp3").id).toBe("Blur - Song 2.5");
  });

  it("takes the filename out of a glob's path", () => {
    expect(trackNameOf("../assets/records/Nena - 99 Luftballons.mp3").id).toBe(
      "Nena - 99 Luftballons",
    );
  });

  it("leaves a dotfile's name alone rather than emptying the id", () => {
    expect(trackNameOf(".gitkeep").id).toBe(".gitkeep");
  });
});

describe("nowPlaying", () => {
  const state = playing(180_000);

  it("says nothing is on when nothing is", () => {
    expect(nowPlaying(SILENT, START)).toBeNull();
  });

  it("is at the top of the record at the moment it started", () => {
    expect(nowPlaying(state, START)).toEqual({
      trackId: "Nena - 99 Luftballons",
      offsetMs: 0,
    });
  });

  it("puts a late joiner where the record already is", () => {
    expect(nowPlaying(state, START + 62_000)?.offsetMs).toBe(62_000);
  });

  it("is still on one millisecond before the end and over at it", () => {
    expect(nowPlaying(state, START + 179_999)?.offsetMs).toBe(179_999);
    expect(nowPlaying(state, START + 180_000)).toBeNull();
  });

  it("expires a state left behind past the ceiling", () => {
    const stale: JukeboxState = {
      playing: {
        trackId: "Nena - 99 Luftballons",
        startedAt: START,
        endsAt: START + RECORD_MAX_MS * 4,
      },
    };
    expect(nowPlaying(stale, START + RECORD_MAX_MS - 1)).not.toBeNull();
    expect(nowPlaying(stale, START + RECORD_MAX_MS)).toBeNull();
  });

  it("says nothing is on to a screen whose clock trails the start", () => {
    expect(nowPlaying(state, START - 1)).toBeNull();
  });
});

describe("the jukebox schemas", () => {
  it("refuses a record longer than the ceiling rather than shortening it", () => {
    expect(
      putRecordSchema.safeParse({ trackId: "Tusk", durationMs: RECORD_MAX_MS })
        .success,
    ).toBe(true);
    expect(
      putRecordSchema.safeParse({
        trackId: "Tusk",
        durationMs: RECORD_MAX_MS + 1,
      }).success,
    ).toBe(false);
  });

  it("refuses an unbounded id, so nothing unbounded reaches storage", () => {
    expect(
      putRecordSchema.safeParse({ trackId: "x".repeat(121), durationMs: 1000 })
        .success,
    ).toBe(false);
    expect(
      putRecordSchema.safeParse({ trackId: "", durationMs: 1000 }).success,
    ).toBe(false);
  });

  it("round-trips silence and a record", () => {
    expect(jukeboxStateSchema.parse(SILENT)).toEqual(SILENT);
    expect(jukeboxStateSchema.parse(playing(1000))).toEqual(playing(1000));
  });
});

describe("isPressTooSoon", () => {
  it("lets a first press through and refuses the one on its heels", () => {
    expect(isPressTooSoon(null, START)).toBe(false);
    expect(isPressTooSoon(START, START + 1)).toBe(true);
    expect(isPressTooSoon(START, START + 5_000)).toBe(false);
  });
});
