import { rampFor } from "@/game/palette";

/** One record, drawn once at module level and worn by every sleeve on the shelf: a filename
 * is all the shelf knows, so there is no art per record to draw. */
const SIZE = 32;

const GROOVES = [15, 13, 11];

const LABEL_R = 6;

const SPINDLE_R = 2;

function disc(ctx: CanvasRenderingContext2D): void {
  const middle = SIZE / 2;
  const ramp = rampFor("J");
  const rings: [number, string][] = [
    [16, ramp.darkest],
    [15, "#303038"],
    [LABEL_R, ramp.light],
    [SPINDLE_R, ramp.darkest],
  ];
  for (const [radius, colour] of rings) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(middle, middle, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#484850";
  ctx.lineWidth = 1;
  for (const radius of GROOVES) {
    ctx.beginPath();
    ctx.arc(middle, middle, radius - 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

let drawn: HTMLCanvasElement | null = null;

/** Cached at module level, the way the tile atlases are: the shelf re-renders on every
 * flick and redrawing the same disc each time is work nobody asked for. */
export function vinyl(): HTMLCanvasElement {
  if (drawn !== null) return drawn;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas is not supported");
  ctx.imageSmoothingEnabled = false;
  disc(ctx);
  drawn = canvas;
  return canvas;
}
