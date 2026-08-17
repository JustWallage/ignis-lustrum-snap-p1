import type { JuryPalette } from "@shared/juries";
import type { GameState } from "@shared/state";
import { CROWD_FIGURE_W, type CrowdMember } from "@/game/crowd";
import { drawText, GLYPH_H, measureText } from "@/game/font";
import { rampFor } from "@/game/palette";
import { PLAYER_H, PLAYER_W, playerSprites } from "@/game/player";
import { remoteSprites } from "@/game/remote-sprites";
import { animFrame, drawTile, TILE, tileAtlas } from "@/game/tiles";

export const SPLASH_TITLE = ["IGNIS", "SNAPS"] as const;

export const SPLASH_PROMPT = "PRESS START TO BEGIN";

export const TITLE_SCALE = 3;

export const TITLE_TRACKING = 1;

const TITLE_Y = 22;
const LINE_GAP = 10;
const SHADOW_OFFSET = 3;
const PROMPT_Y = 92;

const BLINK_MS = 500;

const SKY = rampFor("W").lightest;
const PROMPT_INK = rampFor("W").darkest;
const TITLE_INK = rampFor("R").light;
const SHADOW_INK = rampFor("H").darkest;

// Decoration, not terrain: written in the map's legend so it reuses the tile art, but
// nobody walks here.
const GROUND_ROWS = ["T..t...t.T", ".F......F."] as const;

const CROWD_W = PLAYER_W / CROWD_FIGURE_W;
const CROWD_FEET = 128;
// MORE than the 6 rows a back figure loses to its scale, or the row in front covers it
// completely and fourteen friends read as five.
const CROWD_LIFT = 13;

function centeredX(
  text: string,
  scale: number,
  width: number,
  tracking = 0,
): number {
  return Math.round((width - measureText(text, scale, tracking)) / 2);
}

/** EXCEPT when an event is already running: walking in on someone else's countdown must
 * not sit behind a keypress. `undefined` is the clock still loading, which keeps the
 * splash up rather than flashing the overworld and yanking it back. */
export function shouldSkipSplash(state: GameState | undefined): boolean {
  return state !== undefined && state.phase !== "submission";
}

export type StartAction = "begin" | "title" | "none";

export function startAction(
  splashUp: boolean,
  state: GameState | undefined,
): StartAction {
  if (splashUp) return "begin";
  return shouldSkipSplash(state) ? "none" : "title";
}

export const START_LABELS: Record<StartAction, string> = {
  begin: "Start — begin",
  title: "Start — back to title",
  none: "Start — unavailable during the event",
};

function drawCrowd(
  ctx: CanvasRenderingContext2D,
  crowd: readonly CrowdMember[],
): void {
  const left = (ctx.canvas.width - CROWD_W) / 2;
  for (const member of crowd) {
    const sprites = remoteSprites(member.url) ?? playerSprites();
    const w = Math.round(PLAYER_W * member.scale);
    const h = Math.round(PLAYER_H * member.scale);
    const feet = CROWD_FEET - Math.round((1 - member.depth) * CROWD_LIFT);
    ctx.drawImage(
      sprites.down[0],
      Math.round(left + member.x * CROWD_W - w / 2),
      feet - h,
      w,
      h,
    );
  }
}

export function drawSplash(
  ctx: CanvasRenderingContext2D,
  now: number,
  crowd: readonly CrowdMember[],
  palette: JuryPalette,
): void {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, width, height);

  const atlas = tileAtlas(animFrame(now), palette);
  const groundTop = height / TILE - GROUND_ROWS.length;
  GROUND_ROWS.forEach((row, ry) => {
    for (let tx = 0; tx < row.length; tx++) {
      drawTile(ctx, atlas, row.charAt(tx), tx, groundTop + ry);
    }
  });

  drawCrowd(ctx, crowd);

  SPLASH_TITLE.forEach((line, index) => {
    const x = centeredX(line, TITLE_SCALE, width, TITLE_TRACKING);
    const y = TITLE_Y + index * (GLYPH_H * TITLE_SCALE + LINE_GAP);
    const style = {
      scale: TITLE_SCALE,
      tracking: TITLE_TRACKING,
      color: SHADOW_INK,
    };
    drawText(ctx, line, {
      ...style,
      x: x + SHADOW_OFFSET,
      y: y + SHADOW_OFFSET,
    });
    drawText(ctx, line, { ...style, x, y, color: TITLE_INK });
  });

  if (Math.floor(now / BLINK_MS) % 2 === 0) {
    drawText(ctx, SPLASH_PROMPT, {
      x: centeredX(SPLASH_PROMPT, 1, width),
      y: PROMPT_Y,
      scale: 1,
      color: PROMPT_INK,
    });
  }
}
