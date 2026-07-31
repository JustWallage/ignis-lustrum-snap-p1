import { describe, expect, it } from "vitest";
import { pageOf, stepId, type ViewerSnap } from "./viewer";

const LIST: ViewerSnap[] = [
  { id: 7, url: "a" },
  { id: 8, url: "b" },
  { id: 9, url: "c" },
];

describe("pageOf", () => {
  it("finds the open snap by id, not by position", () => {
    expect(pageOf(LIST, 8)).toEqual({ at: 1, current: LIST[1] });
  });

  it("answers -1 for a snap the list no longer holds", () => {
    expect(pageOf(LIST, 42)).toEqual({ at: -1, current: undefined });
    expect(pageOf([], 7)).toEqual({ at: -1, current: undefined });
  });
});

describe("stepId", () => {
  it("walks both ways", () => {
    expect(stepId(LIST, 7, 1)).toBe(8);
    expect(stepId(LIST, 9, -1)).toBe(8);
  });

  it("wraps at both ends", () => {
    expect(stepId(LIST, 9, 1)).toBe(7);
    expect(stepId(LIST, 7, -1)).toBe(9);
  });

  it("stays put on a list of one", () => {
    expect(stepId([{ id: 7, url: "a" }], 7, 1)).toBe(7);
    expect(stepId([{ id: 7, url: "a" }], 7, -1)).toBe(7);
  });

  it("steps nowhere from a snap that has left the list", () => {
    expect(stepId(LIST, 42, 1)).toBe(42);
    expect(stepId([], 7, 1)).toBe(7);
  });
});
