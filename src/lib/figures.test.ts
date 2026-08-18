import { describe, expect, it } from "vitest";
import { placeText, points } from "./figures";

describe("points", () => {
  it("rounds a half to the figure a scoreboard prints", () => {
    expect(points(41.6)).toBe("42");
    expect(points(0)).toBe("0");
    expect(points(50)).toBe("50");
  });
});

describe("placeText", () => {
  it("prints a place nobody shared as the whole number it is", () => {
    expect(placeText(1)).toBe("1");
    expect(placeText(14)).toBe("14");
  });

  // Rounding is the tempting alternative and it lies: 7.5 is eight snaps sharing the
  // positions 4..11, and "8" is a placing one of them took.
  it("keeps the fraction of a shared place, and says it is shared", () => {
    expect(placeText(7.5)).toBe("=7.5");
    expect(placeText(1.5)).toBe("=1.5");
    expect(placeText(7.5)).not.toBe(placeText(8));
  });
});
