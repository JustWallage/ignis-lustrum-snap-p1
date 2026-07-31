import { MAP_W } from "@shared/map";
import { drawText, GLYPH_H, measureText, type Ink } from "@/game/font";
import { rampFor } from "@/game/palette";
import { TILE } from "@/game/tiles";

// Any more and a two-digit count is wider than the 16px tile it floats over.
const PADDING = 1;

const BORDER = 1;

const LEADING = 1;

const SCREEN_W = MAP_W * TILE;

const FILL = rampFor("H").lightest;
const INK = rampFor("H").darkest;

export function bubbleSize(lines: readonly string[]): {
  width: number;
  height: number;
} {
  const text = Math.max(0, ...lines.map((line) => measureText(line, 1)));
  const rows = Math.max(0, lines.length);
  return {
    width: text + 2 * (PADDING + BORDER),
    height:
      rows * GLYPH_H + Math.max(0, rows - 1) * LEADING + 2 * (PADDING + BORDER),
  };
}

export function drawBubble(
  ink: Ink,
  lines: readonly string[],
  cx: number,
  bottom: number,
): void {
  if (lines.length === 0) return;
  const { width, height } = bubbleSize(lines);
  // Nudged back onto the LCD rather than centred blindly: there is no camera to pan a
  // wide bubble into view.
  const x = Math.min(
    Math.max(0, Math.round(cx - width / 2)),
    Math.max(0, SCREEN_W - width),
  );
  const y = bottom - height;

  ink.fillStyle = INK;
  ink.fillRect(x, y, width, height);
  ink.fillStyle = FILL;
  ink.fillRect(x + BORDER, y + BORDER, width - 2 * BORDER, height - 2 * BORDER);
  lines.forEach((line, row) => {
    drawText(ink, line, {
      x: x + BORDER + PADDING,
      y: y + BORDER + PADDING + row * (GLYPH_H + LEADING),
      scale: 1,
      color: INK,
    });
  });
}
