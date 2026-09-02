const SIZE = 32;

const GROOVES = [14, 12, 10, 8];

const LABEL_R = 5;

const SPINDLE_R = 1.6;

const EDGE = "#100a12";
const FACE = "#2c2430";
const GROOVE = "#4a4252";
const LABEL = "#f8d860";
const GLINT = "#8e8498";

/** A radial bar. Rotation is what makes the disc's motion visible at all, and a disc built
 * only from concentric rings turning is indistinguishable from a still one — so the glints
 * are not decoration, they are the whole reason the spin reads. */
function spoke(
  ctx: CanvasRenderingContext2D,
  middle: number,
  angle: number,
  from: number,
  to: number,
  width: number,
  colour: string,
): void {
  ctx.save();
  ctx.translate(middle, middle);
  ctx.rotate(angle);
  ctx.fillStyle = colour;
  ctx.fillRect(from, -width / 2, to - from, width);
  ctx.restore();
}

function disc(ctx: CanvasRenderingContext2D): void {
  const middle = SIZE / 2;
  const rings: [number, string][] = [
    [16, EDGE],
    [15, FACE],
  ];
  for (const [radius, colour] of rings) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(middle, middle, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = GROOVE;
  ctx.lineWidth = 1;
  for (const radius of GROOVES) {
    ctx.beginPath();
    ctx.arc(middle, middle, radius - 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  spoke(ctx, middle, -0.5, 6, 15, 1.4, GLINT);
  spoke(ctx, middle, -0.2, 8, 14, 1, GLINT);
  ctx.fillStyle = LABEL;
  ctx.beginPath();
  ctx.arc(middle, middle, LABEL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = EDGE;
  ctx.beginPath();
  ctx.arc(middle, middle, SPINDLE_R, 0, Math.PI * 2);
  ctx.fill();
}

let drawn: HTMLCanvasElement | null = null;

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
