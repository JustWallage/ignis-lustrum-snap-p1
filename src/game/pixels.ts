import type { Ramp } from "@/game/palette";

export type Rows = readonly string[];

/** A character with no shade is a HOLE, which is what lets decoration sit over tile art
 * — and `.` is not one: it is the lightest slot, opaque, the fill every tile is built
 * on. Decoration writes `-` for the pixels it does not paint. */
const SHADES: Record<string, keyof Ramp> = {
  ".": "lightest",
  l: "light",
  d: "dark",
  k: "darkest",
};

export function blit(
  ctx: CanvasRenderingContext2D,
  rows: Rows,
  ramp: Ramp,
  ox = 0,
  oy = 0,
): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const shade = SHADES[row.charAt(x)];
      if (shade !== undefined) {
        ctx.fillStyle = ramp[shade];
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  });
}

export function isShade(mark: string): boolean {
  return mark === "-" || SHADES[mark] !== undefined;
}
