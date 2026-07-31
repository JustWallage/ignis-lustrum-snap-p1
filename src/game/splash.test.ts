import { describe, expect, it } from "vitest";
import { MAP_W } from "@shared/map";
import type { GamePhase } from "@shared/state";
import { drawText, measureText } from "@/game/font";
import {
  shouldSkipSplash,
  SPLASH_PROMPT,
  SPLASH_TITLE,
  START_LABELS,
  startAction,
  TITLE_SCALE,
  TITLE_TRACKING,
} from "@/game/splash";
import { TILE } from "@/game/tiles";

const LCD_W = MAP_W * TILE;

function state(phase: GamePhase) {
  return { day: 1, phase, submissionCount: 0 };
}

interface Pixel {
  x: number;
  y: number;
  w: number;
  h: number;
}

function paint(text: string, scale = 1): Pixel[] {
  const pixels: Pixel[] = [];
  const ink = {
    fillStyle: "",
    fillRect(x: number, y: number, w: number, h: number) {
      pixels.push({ x, y, w, h });
    },
  };
  drawText(ink, text, { x: 0, y: 0, scale, color: "#000" });
  return pixels;
}

const LINES = [...SPLASH_TITLE, SPLASH_PROMPT];

describe("shouldSkipSplash", () => {
  it("keeps the splash up while the clock is still loading", () => {
    expect(shouldSkipSplash(undefined)).toBe(false);
  });

  it("keeps the splash up during normal play", () => {
    expect(shouldSkipSplash(state("submission"))).toBe(false);
  });

  it("skips it whenever a live event is already running", () => {
    for (const phase of ["countdown", "reveal", "wheel"] as const) {
      expect(shouldSkipSplash(state(phase))).toBe(true);
    }
  });
});

describe("startAction", () => {
  it("begins the game while the title screen is up", () => {
    expect(startAction(true, undefined)).toBe("begin");
    expect(startAction(true, state("submission"))).toBe("begin");
  });

  it("goes back to the title screen from the overworld", () => {
    expect(startAction(false, state("submission"))).toBe("title");
    expect(startAction(false, undefined)).toBe("title");
  });

  it("does nothing at all during a live event", () => {
    for (const phase of ["countdown", "reveal", "wheel"] as const) {
      expect(startAction(false, state(phase))).toBe("none");
    }
    expect(startAction(true, state("wheel"))).toBe("begin");
  });

  it("never says the word sign — that lives in the SELECT menu now", () => {
    for (const label of Object.values(START_LABELS)) {
      expect(label).toMatch(/^Start — /);
      expect(label).not.toMatch(/sign/i);
    }
  });
});

describe("the title screen's text", () => {
  it("has a glyph for every character it draws", () => {
    for (const line of LINES) {
      for (const char of new Set(line.replace(/ /g, ""))) {
        expect(paint(char), `no glyph for "${char}"`).not.toHaveLength(0);
      }
    }
  });

  it("draws a space as a gap", () => {
    expect(paint(" ")).toHaveLength(0);
  });

  it("keeps every glyph inside the width it is measured at", () => {
    for (const line of LINES) {
      const right = Math.max(...paint(line).map((p) => p.x + p.w));
      expect(right).toBeLessThanOrEqual(measureText(line, 1));
    }
  });

  it("fits the 160px screen at the scale it is drawn", () => {
    for (const line of SPLASH_TITLE) {
      expect(
        measureText(line, TITLE_SCALE, TITLE_TRACKING),
      ).toBeLessThanOrEqual(LCD_W);
    }
    expect(measureText(SPLASH_PROMPT, 1)).toBeLessThanOrEqual(LCD_W);
  });

  it("scales every pixel it paints", () => {
    expect(paint("A", TITLE_SCALE).every((p) => p.w === TITLE_SCALE)).toBe(
      true,
    );
  });
});
