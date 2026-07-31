import { describe, expect, it } from "vitest";
import { gamePhaseSchema, gameStateSchema } from "./state";

const VALID = { day: 1, phase: "submission", submissionCount: 0 };

describe("gamePhaseSchema", () => {
  it("knows exactly the four phases of a day", () => {
    expect([...gamePhaseSchema.options]).toEqual([
      "submission",
      "countdown",
      "reveal",
      "wheel",
    ]);
  });

  it("refuses anything else", () => {
    expect(gamePhaseSchema.safeParse("party").success).toBe(false);
    expect(gamePhaseSchema.safeParse("Submission").success).toBe(false);
    expect(gamePhaseSchema.safeParse("").success).toBe(false);
  });
});

describe("gameStateSchema", () => {
  it("accepts a well-formed clock", () => {
    expect(gameStateSchema.parse(VALID)).toEqual(VALID);
  });

  it("refuses a day that is not a positive integer", () => {
    for (const day of [0, -1, 1.5, "1", null]) {
      expect(gameStateSchema.safeParse({ ...VALID, day }).success).toBe(false);
    }
  });

  it("refuses a negative or fractional submission count", () => {
    for (const submissionCount of [-1, 0.5, "0"]) {
      expect(
        gameStateSchema.safeParse({ ...VALID, submissionCount }).success,
      ).toBe(false);
    }
  });

  it("refuses an unknown phase rather than falling back to one", () => {
    expect(
      gameStateSchema.safeParse({ ...VALID, phase: "party" }).success,
    ).toBe(false);
  });

  it("refuses a payload that is missing a field", () => {
    expect(gameStateSchema.safeParse({ day: 1, phase: "wheel" }).success).toBe(
      false,
    );
  });
});
