import { describe, expect, it } from "vitest";
import { MAP_W } from "@shared/map";
import { bubbleSize, drawBubble } from "@/game/badge";
import { drawText, GLYPH_H, type Ink } from "@/game/font";
import { TILE } from "@/game/tiles";

const SCREEN_W = MAP_W * TILE;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

function record(): { ink: Ink; rects: Rect[] } {
  const rects: Rect[] = [];
  const ink = {
    fillStyle: "",
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fill: ink.fillStyle });
    },
  };
  return { ink, rects };
}

function paintBubble(lines: readonly string[], cx = 40, bottom = 60): Rect[] {
  const { ink, rects } = record();
  drawBubble(ink, lines, cx, bottom);
  return rects;
}

function paintDigits(text: string): Rect[] {
  const { ink, rects } = record();
  drawText(ink, text, { x: 0, y: 0, scale: 1, color: "#000" });
  return rects;
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

describe("the pixel font's digits", () => {
  it("has a glyph for all ten of them", () => {
    for (const digit of DIGITS) {
      expect(paintDigits(digit), `no glyph for "${digit}"`).not.toHaveLength(0);
    }
  });

  it("gives each digit its own shape", () => {
    const shapes = DIGITS.map((digit) => JSON.stringify(paintDigits(digit)));
    expect(new Set(shapes).size).toBe(DIGITS.length);
  });
});

describe("drawBubble", () => {
  it("grows with the number of digits", () => {
    expect(bubbleSize(["9"]).width).toBeLessThan(bubbleSize(["10"]).width);
    expect(bubbleSize(["9"]).height).toBe(bubbleSize(["140"]).height);
  });

  it("sits centred above the point it is given", () => {
    const { width, height } = bubbleSize(["7"]);
    const rects = paintBubble(["7"], 40, 60);
    const left = Math.min(...rects.map((r) => r.x));
    const right = Math.max(...rects.map((r) => r.x + r.w));
    const bottom = Math.max(...rects.map((r) => r.y + r.h));
    expect(Math.abs((left + right) / 2 - 40)).toBeLessThanOrEqual(0.5);
    expect(right - left).toBe(width);
    expect(bottom).toBe(60);
    expect(Math.min(...rects.map((r) => r.y))).toBe(60 - height);
  });

  it("paints the digits over the bubble, in the bubble's own two colours", () => {
    const rects = paintBubble(["12"]);
    const [frame, fill] = rects;
    if (frame === undefined || fill === undefined) {
      throw new Error("the bubble itself was not painted");
    }
    expect(fill.fill).not.toBe(frame.fill);
    expect(rects.slice(2).every((r) => r.fill === frame.fill)).toBe(true);
    expect(rects).toHaveLength(2 + paintDigits("12").length);
  });

  it("stays small enough to float over one tile", () => {
    expect(bubbleSize(["99"]).width).toBeLessThanOrEqual(TILE);
    expect(bubbleSize(["99"]).height).toBeLessThanOrEqual(TILE);
  });

  it("grows downwards for a second and third line", () => {
    const one = bubbleSize(["HELLO"]);
    const two = bubbleSize(["HELLO", "AGAIN"]);
    const three = bubbleSize(["HELLO", "AGAIN", "FRIEND"]);
    expect(two.height - one.height).toBe(three.height - two.height);
    expect(two.width).toBe(one.width);
    expect(three.width).toBe(bubbleSize(["FRIEND"]).width);
  });

  it("stacks the lines in order, none of them overlapping", () => {
    const rects = paintBubble(["AB", "CD"]);
    const ink = rects.slice(2);
    const firstBottom = Math.min(...ink.map((r) => r.y)) + GLYPH_H;
    const below = ink.filter((r) => r.y >= firstBottom);
    expect(below.length).toBeGreaterThan(0);
    expect(below.length).toBeLessThan(ink.length);
  });

  it("paints nothing at all for no lines", () => {
    expect(paintBubble([])).toHaveLength(0);
  });

  it("nudges a wide bubble back onto the screen", () => {
    const wide = "MMMMMMMMMMMMMM";
    const left = paintBubble([wide], 8, 60);
    const right = paintBubble([wide], SCREEN_W - 8, 60);
    expect(Math.min(...left.map((r) => r.x))).toBe(0);
    expect(Math.max(...right.map((r) => r.x + r.w))).toBe(SCREEN_W);
  });
});
