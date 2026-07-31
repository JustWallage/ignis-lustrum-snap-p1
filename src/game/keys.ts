import type { Direction } from "@shared/map";

export const KEY_DIRS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

export function isConfirmKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "z" || key === "Z";
}

export function isCancelKey(key: string): boolean {
  return key === "Escape" || key === "x" || key === "X" || key === "Backspace";
}

/** `c` sits beside A (`z`) and B (`x`) in the emulator cluster, and unlike Shift it
 * cannot fire by accident: Shift arrives on its own keydown while somebody types a
 * capital `W`, which `KEY_DIRS` already reads as walking. */
export function isSelectKey(key: string): boolean {
  return key === "c" || key === "C";
}
