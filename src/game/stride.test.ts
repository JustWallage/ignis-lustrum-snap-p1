import { describe, expect, it } from "vitest";
import { hasLanded, poseAt, STEP_MS, strideTo } from "@/game/stride";
import { TILE } from "@/game/tiles";

const HERE = { x: 2, y: 4 };

describe("strideTo", () => {
  it("takes one step's time to cross one tile", () => {
    expect(strideTo(HERE, { x: 3, y: 4 }, 1000)).toEqual({
      fromX: 2,
      fromY: 4,
      start: 1000,
      ms: STEP_MS,
    });
  });

  it("takes two steps' time to cross the door's two tiles", () => {
    expect(strideTo({ x: 2, y: 4 }, { x: 2, y: 2 }, 0).ms).toBe(2 * STEP_MS);
  });
});

describe("poseAt", () => {
  it("paints somebody standing still on their own tile", () => {
    expect(poseAt(HERE, null, 5000)).toEqual({
      px: 2 * TILE,
      py: 4 * TILE,
      walking: false,
    });
  });

  it("walks them between the two tiles for the length of the stride", () => {
    const stride = strideTo(HERE, { x: 3, y: 4 }, 0);
    expect(poseAt({ x: 3, y: 4 }, stride, 0).px).toBe(2 * TILE);
    expect(poseAt({ x: 3, y: 4 }, stride, STEP_MS / 2).px).toBe(2.5 * TILE);
    expect(poseAt({ x: 3, y: 4 }, stride, STEP_MS).px).toBe(3 * TILE);
  });

  it("never overshoots, however late the frame is", () => {
    const stride = strideTo(HERE, { x: 3, y: 4 }, 0);
    expect(poseAt({ x: 3, y: 4 }, stride, 10 * STEP_MS)).toEqual({
      px: 3 * TILE,
      py: 4 * TILE,
      walking: false,
    });
  });

  it("shows the step frame for the first half of the stride", () => {
    const stride = strideTo(HERE, { x: 2, y: 5 }, 0);
    const at = { x: 2, y: 5 };
    expect(poseAt(at, stride, 1).walking).toBe(true);
    expect(poseAt(at, stride, STEP_MS * 0.49).walking).toBe(true);
    expect(poseAt(at, stride, STEP_MS * 0.51).walking).toBe(false);
  });
});

describe("hasLanded", () => {
  it("is the end of the stride, and scales with it", () => {
    const one = strideTo(HERE, { x: 3, y: 4 }, 0);
    expect(hasLanded(one, STEP_MS - 1)).toBe(false);
    expect(hasLanded(one, STEP_MS)).toBe(true);

    const two = strideTo({ x: 2, y: 4 }, { x: 2, y: 2 }, 0);
    expect(hasLanded(two, STEP_MS)).toBe(false);
    expect(hasLanded(two, 2 * STEP_MS)).toBe(true);
  });
});
