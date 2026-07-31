import type { Point } from "@shared/map";
import { TILE } from "@/game/tiles";

export const STEP_MS = 170;

/** `ms` scales with the DISTANCE, so the door's two-tile transit is one stride. */
export interface Stride {
  fromX: number;
  fromY: number;
  start: number;
  ms: number;
}

export function strideTo(from: Point, to: Point, now: number): Stride {
  const tiles = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  return { fromX: from.x, fromY: from.y, start: now, ms: STEP_MS * tiles };
}

export function hasLanded(stride: Stride, now: number): boolean {
  return now - stride.start >= stride.ms;
}

export function poseAt(
  at: Point,
  stride: Stride | null,
  now: number,
): { px: number; py: number; walking: boolean } {
  if (stride === null) {
    return { px: at.x * TILE, py: at.y * TILE, walking: false };
  }
  const t = Math.min(1, (now - stride.start) / stride.ms);
  return {
    px: Math.round((stride.fromX + (at.x - stride.fromX) * t) * TILE),
    py: Math.round((stride.fromY + (at.y - stride.fromY) * t) * TILE),
    walking: t < 0.5,
  };
}
