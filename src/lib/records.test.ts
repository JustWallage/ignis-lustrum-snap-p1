import { describe, expect, it } from "vitest";
import { sleevesOf, stepTo } from "./records";

function steps(count: number, at: number): number[] {
  return sleevesOf(count, at).map((sleeve) => sleeve.step);
}

function indexes(count: number, at: number): number[] {
  return sleevesOf(count, at).map((sleeve) => sleeve.index);
}

describe("stepTo", () => {
  it("wraps at both ends, so the shelf is a loop", () => {
    expect(stepTo(5, 0, 1)).toBe(1);
    expect(stepTo(5, 4, 1)).toBe(0);
    expect(stepTo(5, 0, -1)).toBe(4);
  });

  it("steps nowhere on a one-record shelf", () => {
    expect(stepTo(1, 0, 1)).toBe(0);
    expect(stepTo(1, 0, -1)).toBe(0);
  });

  it("stays at nothing on an empty shelf", () => {
    expect(stepTo(0, 0, 1)).toBe(0);
    expect(stepTo(0, 0, -1)).toBe(0);
  });
});

describe("sleevesOf", () => {
  it("places nothing at all on an empty shelf", () => {
    expect(sleevesOf(0, 0)).toEqual([]);
  });

  it("shows a one-record shelf as the one record, facing you", () => {
    expect(steps(1, 0)).toEqual([0]);
    const [only] = sleevesOf(1, 0);
    expect(only?.index).toBe(0);
    expect(only?.leftPct).toBe(50);
    expect(only?.scale).toBe(1);
    expect(only?.opacity).toBe(1);
  });

  it("reaches two either way once the shelf is long enough", () => {
    expect(steps(3, 0)).toEqual([-1, 0, 1]);
    expect(steps(4, 0)).toEqual([-1, 0, 1]);
    expect(steps(5, 0)).toEqual([-2, -1, 0, 1, 2]);
    expect(steps(9, 4)).toEqual([-2, -1, 0, 1, 2]);
  });

  it("offers each record ONCE, however short the shelf", () => {
    for (const count of [1, 2, 3, 4, 5, 6]) {
      const shown = indexes(count, 0);
      expect(new Set(shown).size, `${String(count)} records`).toBe(
        shown.length,
      );
    }
  });

  it("wraps the neighbours round the ends of the shelf", () => {
    expect(indexes(5, 0)).toEqual([3, 4, 0, 1, 2]);
    expect(indexes(5, 4)).toEqual([2, 3, 4, 0, 1]);
  });

  it("faces the record dead centre, at full size and full ink", () => {
    const faced = sleevesOf(7, 3).find((sleeve) => sleeve.step === 0);
    expect(faced?.index).toBe(3);
    expect(faced?.leftPct).toBe(50);
    expect(faced?.scale).toBe(1);
    expect(faced?.opacity).toBe(1);
  });

  it("puts the neighbours further out, smaller and dimmer the further they go", () => {
    const placed = sleevesOf(7, 3);
    const away = (step: number) =>
      placed.find((sleeve) => sleeve.step === step);
    for (const side of [1, -1]) {
      const near = away(side);
      const far = away(side * 2);
      expect(near?.scale).toBeLessThan(1);
      expect(far?.scale).toBeLessThan(near?.scale ?? 0);
      expect(far?.opacity).toBeLessThan(near?.opacity ?? 0);
      // Painter's order: the faced sleeve is highest, so its neighbours tuck behind it.
      expect(near?.z).toBeGreaterThan(far?.z ?? 0);
    }
    expect(away(0)?.z).toBeGreaterThan(away(1)?.z ?? 0);
    expect(away(-1)?.leftPct).toBeLessThan(50);
    expect(away(1)?.leftPct).toBeGreaterThan(50);
    // Symmetrical about the faced record, or a flick one way would look unlike the other.
    expect((away(-1)?.leftPct ?? 0) + (away(1)?.leftPct ?? 0)).toBeCloseTo(100);
  });

  it("keeps every sleeve visible rather than fading one to nothing", () => {
    for (const sleeve of sleevesOf(11, 5)) {
      expect(sleeve.opacity, `step ${String(sleeve.step)}`).toBeGreaterThan(0);
      expect(sleeve.scale, `step ${String(sleeve.step)}`).toBeGreaterThan(0);
    }
  });
});
