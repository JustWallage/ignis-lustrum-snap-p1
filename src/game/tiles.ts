import { rampFor, TILE_RAMPS, type Ramp } from "@/game/palette";
import { blit } from "@/game/pixels";

export const TILE = 16;

export const JUKEBOX_TILE = "J";

/** A character `MAP_ROWS` never contains: the map says where the cabinet IS, the shared
 * playback which of its two looks gets blitted. */
export const JUKEBOX_LIT_TILE = "j";

const ORDER = Object.keys(TILE_RAMPS);

type Ctx = CanvasRenderingContext2D;

const GRASS_ROWS = [
  "l...l...l...l...",
  "................",
  "..l...l...l...l.",
  "................",
  "l...l...l...l...",
  "................",
  "..l...l...l...l.",
  "................",
  "l...l...l...l...",
  "................",
  "..l...l...l...l.",
  "................",
  "l...l...l...l...",
  "................",
  "..l...l...l...l.",
  "................",
];

const PATH_ROWS = [
  "................",
  "..l.........l...",
  "................",
  "................",
  ".......l........",
  "................",
  "..............l.",
  "..l.............",
  "................",
  "................",
  "..........l.....",
  "................",
  ".....l..........",
  "................",
  "............l...",
  "................",
];

const SAND_ROWS = [
  "......l.........",
  "...l.......l....",
  ".......l........",
  "..l.........l.l.",
  "l......l........",
  "....l.......l...",
  ".l.......l......",
  "......l....l..l.",
  "..l.l.......l...",
  "l.....l..k......",
  "...l.....l....l.",
  ".l...l......l...",
  "....l...l..l...l",
  ".l.l...l.....l..",
  "..l...k.l...l.l.",
  "l...l...l.l...l.",
];

const TALL_GRASS_ROWS = [
  "d..l..d..l..d..l",
  ".dd..dd..dd..dd.",
  "l.d.l.d.l.d.l.d.",
  ".ddl.ddl.ddl.ddl",
  "d.d..d.d..d.d..d",
  ".l.dd.l.dd.l.dd.",
  "dd.d.dd.d.dd.d.d",
  ".d.l..d.l..d.l..",
  "d..l..d..l..d..l",
  ".dd..dd..dd..dd.",
  "l.d.l.d.l.d.l.d.",
  ".ddl.ddl.ddl.ddl",
  "d.d..d.d..d.d..d",
  ".l.dd.l.dd.l.dd.",
  "dd.d.dd.d.dd.d.d",
  ".d.l..d.l..d.l..",
];

/** Exported because a themed tree is this silhouette in other colours
 * (`game/decor.ts`): a second copy of it would drift the moment the art is redrawn. */
export const TREE_ROWS = [
  "................",
  "....kkkkkkkk....",
  "..kkldldldllkk..",
  ".kldldldldldlk..",
  ".kdldldldldldk..",
  "kldldldldldldlk.",
  "kdldldldldldldk.",
  "kldldldldldldlk.",
  ".kdldldldldldk..",
  ".kkldldldldlkk..",
  "..kkkddddkkkk...",
  "....kkddkk......",
  ".....kddk.......",
  ".....kddk.......",
  "....kddddk......",
  "................",
];

const ROOF_ROWS = [
  "kkkkkkkkkkkkkkkk",
  "llllllllllllllll",
  "dddddddddddddddd",
  "dddddddddddddddd",
  "kkkkkkkkkkkkkkkk",
  "dddddddddddddddd",
  "dddddddddddddddd",
  "kkkkkkkkkkkkkkkk",
  "dddddddddddddddd",
  "dddddddddddddddd",
  "kkkkkkkkkkkkkkkk",
  "dddddddddddddddd",
  "dddddddddddddddd",
  "dddddddddddddddd",
  "kkkkkkkkkkkkkkkk",
  "dddddddddddddddd",
];

// Nothing touches the top or bottom edge, so a column reads as one unbroken wall.
const SIDE_ROWS = [
  ".k..l...k..l..k.",
  ".k..l...k..l..k.",
  ".k..l...k..l..k.",
  ".k..d...k..d..k.",
  ".k..l...k..l..k.",
  ".k..l...k..l..k.",
  ".k..l...k..l..k.",
  ".k..d...k..d..k.",
  ".k..l...k..l..k.",
  ".k..l...k..l..k.",
  ".k..l...k..l..k.",
  ".k..d...k..d..k.",
  ".k..l...k..l..k.",
  ".k..l...k..l..k.",
  ".k..l...k..l..k.",
  ".k..d...k..d..k.",
];

const FLOOR_ROWS = [
  "................",
  ".......d........",
  "...l...d....l...",
  "kkkkkkkkkkkkkkkk",
  "................",
  "...d............",
  "...d...l........",
  "kkkkkkkkkkkkkkkk",
  "................",
  "...........d....",
  "..l........d....",
  "kkkkkkkkkkkkkkkk",
  "................",
  ".......d........",
  ".....l.d........",
  "kkkkkkkkkkkkkkkk",
];

const SHELF_ROWS = [
  "kkkkkkkkkkkkkkkk",
  "k.ld.dl.ldl.dl.k",
  "k.ld.dl.ldl.dl.k",
  "k.ld.dl.ldl.dl.k",
  "kkkkkkkkkkkkkkkk",
  "k.dl.ld.dld.ld.k",
  "k.dl.ld.dld.ld.k",
  "k.dl.ld.dld.ld.k",
  "kkkkkkkkkkkkkkkk",
  "k.ldl.dl.ld.dl.k",
  "k.ldl.dl.ld.dl.k",
  "k.ldl.dl.ld.dl.k",
  "kkkkkkkkkkkkkkkk",
  "k..............k",
  "k..............k",
  "kkkkkkkkkkkkkkkk",
];

// Drawn out of `d` and `k` ONLY: the grass dither is blitted underneath first and is
// written in `l`, so that slot stays green and the metal spends the other two.
const TROPHY_ROWS = [
  "................",
  "................",
  "....kkkkkkkk....",
  "...kddddddddk...",
  "..kkdddddddkk...",
  ".kdkdddddddkdk..",
  ".kdkdddddddkdk..",
  ".kdkkdddddkkdk..",
  ".kdk.kdddk.kdk..",
  "..kk..kddk..kk..",
  ".......kk.......",
  ".....kkkkkk.....",
  "....kddddddk....",
  "...kkkkkkkkkk...",
  "...kddddddddk...",
  "...kkkkkkkkkk...",
];

// The lamps, the window and the grille are `d` here and overlaid in `l` for the lit glyph,
// so ONE body serves both states and their shapes cannot drift apart.
const JUKEBOX_ROWS = [
  "................",
  "..kkkkkkkkkkkkk.",
  "..kdddddddddddk.",
  "..kkkkkkkkkkkkk.",
  "..kdddddddddddk.",
  "..kdddddddddddk.",
  "..kdddddddddddk.",
  "..kdddddddddddk.",
  "..kkkkkkkkkkkkk.",
  "..kdddddddddddk.",
  "..kdddddddddddk.",
  "..kdddddddddddk.",
  "..kkkkkkkkkkkkk.",
  "..kdllllllllldk.",
  "..kdddddddddddk.",
  "..kkkkkkkkkkkkk.",
];

/** Lit in BOTH frames, which is why `e2e/jukebox.spec.ts` samples HERE: a chasing lamp is
 * bright in one frame only. */
const JUKEBOX_GLOW = [
  "lllllllllll",
  "ldllllllldl",
  "lldllllldll",
  "lllllllllll",
];

const JUKEBOX_MARQUEE: readonly [string[], string[]] = [
  ["ldldldldldl"],
  ["dldldldldld"],
];

const JUKEBOX_GRILLE: readonly [string[], string[]] = [
  ["lllllllllll", "dldldldldld"],
  ["dldldldldld", "lllllllllll"],
];

const JUKEBOX_MARQUEE_AT = { x: 3, y: 2 };
const JUKEBOX_GLOW_AT = { x: 3, y: 4 };
const JUKEBOX_GRILLE_AT = { x: 3, y: 9 };

const WALL_ROWS = [
  "kkkkkkkkkkkkkkkk",
  "................",
  "................",
  "....kkkkkkkk....",
  "....kllllllk....",
  "....kllllllk....",
  "....kkkkkkkk....",
  "....kllllllk....",
  "....kllllllk....",
  "....kkkkkkkk....",
  "................",
  "................",
  ".l.l.l.l.l.l.l..",
  "................",
  "................",
  "dddddddddddddddd",
];

const DOOR_ROWS = [
  "kkkkkkkkkkkkkkkk",
  "................",
  "...kkkkkkkkkk...",
  "...kddddddddk...",
  "...kddddddddk...",
  "...kddddddddk...",
  "...kddddddddk...",
  "...kddddddddk...",
  "...kddddddd.k...",
  "...kddddddddk...",
  "...kddddddddk...",
  "...kddddddddk...",
  "...kddddddddk...",
  "...kddddddddk...",
  "...kddddddddk...",
  "...kddddddddk...",
];

const FLOWER_FRAMES: readonly [string[], string[]] = [
  [".k.", "klk", ".k."],
  ["k.k", ".l.", "k.k"],
];

function waterRow(pattern: string, shift: number): string {
  return pattern.slice(shift) + pattern.slice(0, shift);
}

function paintWater(ctx: Ctx, frame: 0 | 1, ramp: Ramp) {
  ctx.fillStyle = ramp.light;
  ctx.fillRect(0, 0, TILE, TILE);
  const shift = frame === 0 ? 0 : 3;
  for (let y = 0; y < TILE; y++) {
    if (y % 4 === 1) {
      blit(ctx, [waterRow("dd......dd......", shift)], ramp, 0, y);
    } else if (y % 4 === 3) {
      blit(ctx, [waterRow("....dd......dd..", shift)], ramp, 0, y);
    }
  }
}

function paint(ctx: Ctx, tile: string, frame: 0 | 1, ramp: Ramp) {
  ctx.fillStyle = ramp.lightest;
  ctx.fillRect(0, 0, TILE, TILE);
  if (tile === "t") blit(ctx, TALL_GRASS_ROWS, ramp);
  else if (tile === "P") blit(ctx, PATH_ROWS, ramp);
  else if (tile === "s") blit(ctx, SAND_ROWS, ramp);
  else if (tile === "F") {
    blit(ctx, GRASS_ROWS, ramp);
    blit(ctx, FLOWER_FRAMES[frame], ramp, 3, 4);
    blit(ctx, FLOWER_FRAMES[frame === 0 ? 1 : 0], ramp, 10, 9);
  } else if (tile === "T") blit(ctx, TREE_ROWS, ramp);
  else if (tile === "W") paintWater(ctx, frame, ramp);
  else if (tile === "R") blit(ctx, ROOF_ROWS, ramp);
  else if (tile === "S") blit(ctx, SIDE_ROWS, ramp);
  else if (tile === "H") blit(ctx, WALL_ROWS, ramp);
  else if (tile === "D") blit(ctx, DOOR_ROWS, ramp);
  else if (tile === "f") blit(ctx, FLOOR_ROWS, ramp);
  else if (tile === "A") blit(ctx, SHELF_ROWS, ramp);
  else if (tile === JUKEBOX_TILE || tile === JUKEBOX_LIT_TILE) {
    blit(ctx, JUKEBOX_ROWS, ramp);
    if (tile === JUKEBOX_LIT_TILE) {
      blit(ctx, JUKEBOX_GLOW, ramp, JUKEBOX_GLOW_AT.x, JUKEBOX_GLOW_AT.y);
      const { x, y } = JUKEBOX_MARQUEE_AT;
      blit(ctx, JUKEBOX_MARQUEE[frame], ramp, x, y);
      blit(
        ctx,
        JUKEBOX_GRILLE[frame],
        ramp,
        JUKEBOX_GRILLE_AT.x,
        JUKEBOX_GRILLE_AT.y,
      );
    }
  } else if (tile === "Y") {
    // Grass first, so the dither shows around the plinth's base.
    blit(ctx, GRASS_ROWS, ramp);
    blit(ctx, TROPHY_ROWS, ramp);
  } else blit(ctx, GRASS_ROWS, ramp);
}

function buildAtlas(frame: 0 | 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TILE * ORDER.length;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas is not supported");
  ORDER.forEach((tile, i) => {
    ctx.save();
    ctx.translate(i * TILE, 0);
    ctx.beginPath();
    ctx.rect(0, 0, TILE, TILE);
    ctx.clip();
    paint(ctx, tile, frame, rampFor(tile));
    ctx.restore();
  });
  return canvas;
}

const atlases = new Map<0 | 1, HTMLCanvasElement>();

export function tileAtlas(frame: 0 | 1): HTMLCanvasElement {
  const cached = atlases.get(frame);
  if (cached !== undefined) return cached;
  const built = buildAtlas(frame);
  atlases.set(frame, built);
  return built;
}

const ANIM_MS = 450;

export function animFrame(now: number): 0 | 1 {
  return Math.floor(now / ANIM_MS) % 2 === 0 ? 0 : 1;
}

function tileOffset(tile: string): number {
  const index = ORDER.indexOf(tile);
  return (index === -1 ? 0 : index) * TILE;
}

export function drawTile(
  ctx: Ctx,
  atlas: HTMLCanvasElement,
  tile: string,
  tx: number,
  ty: number,
): void {
  ctx.drawImage(
    atlas,
    tileOffset(tile),
    0,
    TILE,
    TILE,
    tx * TILE,
    ty * TILE,
    TILE,
    TILE,
  );
}
