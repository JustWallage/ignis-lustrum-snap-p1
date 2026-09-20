import { describe, expect, it } from "vitest";
import type { PublicPhoto } from "@shared/api";
import { daysOf, stepThrough } from "./gallery";

function photo(id: number, day: number, theme: string): PublicPhoto {
  return {
    id,
    url: `/api/public/photos/${String(id)}/image`,
    day,
    theme,
    photographer: "tester",
    score: null,
  };
}

const FEED = [photo(9, 3, "Fire"), photo(8, 3, "Fire"), photo(4, 1, "Water")];

describe("daysOf", () => {
  it("groups a day's photographs under one theme, in the order given", () => {
    expect(daysOf(FEED)).toEqual([
      { day: 3, theme: "Fire", photos: [FEED[0], FEED[1]] },
      { day: 1, theme: "Water", photos: [FEED[2]] },
    ]);
  });

  it("answers an empty gallery with no days rather than one empty one", () => {
    expect(daysOf([])).toEqual([]);
  });

  // The route sorts; this only walks. A day that came back split would stay split
  // rather than being silently re-joined out of order.
  it("does not reorder a feed that arrives split", () => {
    const split = [
      photo(9, 3, "Fire"),
      photo(4, 1, "Water"),
      photo(8, 3, "Fire"),
    ];
    expect(daysOf(split).map((group) => group.day)).toEqual([3, 1, 3]);
  });
});

describe("stepThrough", () => {
  it("walks across the day boundary and wraps both ways", () => {
    expect(stepThrough(FEED, 8, 1)).toBe(4);
    expect(stepThrough(FEED, 4, 1)).toBe(9);
    expect(stepThrough(FEED, 9, -1)).toBe(4);
  });

  it("stays put for a photograph the gallery no longer holds", () => {
    expect(stepThrough(FEED, 99, 1)).toBe(99);
    expect(stepThrough([], 9, 1)).toBe(9);
  });
});
