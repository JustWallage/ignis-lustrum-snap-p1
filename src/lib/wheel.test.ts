import { describe, expect, it } from "vitest";
import { MIN_ENABLED_PRIZES } from "@shared/prizes";
import { drumOf, isFacing } from "@/lib/wheel";

const COUNTS = Array.from(
  { length: 14 - MIN_ENABLED_PRIZES },
  (_, at) => MIN_ENABLED_PRIZES + at,
);

function facesOf(count: number): number {
  return count * drumOf(count).copies;
}

function facing(count: number, offset: number): number[] {
  const drum = drumOf(count);
  return Array.from({ length: facesOf(count) }, (_, face) => face).filter(
    (face) => isFacing(drum, face, offset),
  );
}

describe("drumOf", () => {
  it("carries whole copies of the list, so a full turn is not a seam", () => {
    for (const count of COUNTS) {
      expect(facesOf(count) % count).toBe(0);
    }
  });

  it("keeps several prizes on the barrel at the smallest legal wheel", () => {
    expect(facesOf(MIN_ENABLED_PRIZES)).toBeGreaterThanOrEqual(16);
  });

  it("puts the offset's own prize on the marker, however far it has turned", () => {
    for (const count of COUNTS) {
      const faces = facesOf(count);
      for (const offset of [0, 1, count, 4 * count + 1, 9 * count + 2]) {
        expect((offset % faces) % count).toBe(offset % count);
      }
    }
  });

  it("fits the barrel inside its window", () => {
    for (const count of COUNTS) {
      const drum = drumOf(count);
      expect(2 * drum.radiusCqw).toBeLessThan(drum.windowCqw);
      expect(drum.slotCqw).toBeGreaterThan(drum.faceCqw);
    }
  });
});

describe("isFacing", () => {
  it("shows one unbroken run of faces, always the one under the marker", () => {
    for (const count of COUNTS) {
      const faces = facesOf(count);
      for (let step = 0; step < 40; step += 1) {
        const offset = step / 7;
        const shown = facing(count, offset);
        const gaps = shown.filter(
          (face, at) => at > 0 && face !== (shown[at - 1] ?? -1) + 1,
        );
        // ONE gap, where the run wraps past the last face; two would be a face lit up
        // on its own, somewhere behind the barrel.
        expect(gaps.length).toBeLessThan(2);
        expect(shown).toContain(Math.round(offset) % faces);
        // The NEAR HALF of the barrel, give or take the face crossing the horizon.
        expect(shown.length).toBeGreaterThan(faces / 2 - 2);
        expect(shown.length).toBeLessThan(faces / 2 + 2);
      }
    }
  });

  it("never gains or loses more than one face at a time", () => {
    for (const count of COUNTS) {
      let before = facing(count, 0).length;
      for (let step = 1; step < 200; step += 1) {
        const now = facing(count, step / 50).length;
        expect(Math.abs(now - before)).toBeLessThan(2);
        before = now;
      }
    }
  });
});
