// 12x16 pixel art, two walk frames per direction (left mirrors right). Rows are shade
// letters resolved through a `SpriteRamp`, so fourteen juries come out of ONE set of
// rows. A generated sprite is the same art from the waist down.

import type { JurySprite } from "@shared/juries";
import type { Direction } from "@shared/map";
import {
  dominantColour,
  keyOutBackground,
  opaqueBounds,
  portraitRect,
  type Box,
} from "@/game/avatar";
import {
  BEAST_RAMP,
  jurySpriteRamp,
  PLAYER_RAMP,
  type SpriteRamp,
} from "@/game/palette";

export const PLAYER_W = 12;
export const PLAYER_H = 16;

const BEAST_W = 16;

const PARTS: Record<string, keyof SpriteRamp> = {
  o: "outline",
  s: "skin",
  h: "hair",
  a: "hat",
  c: "shirt",
  p: "trousers",
};

const HEAD_FRONT = [
  "....hhhh....",
  "..hhhhhhhh..",
  ".hhhhhhhhhh.",
  ".hooooooooh.",
  "..ssssssss..",
  "..sossssos..",
  "..ssssssss..",
  "...ssssss...",
];

const HEAD_BACK = [
  "....hhhh....",
  "..hhhhhhhh..",
  ".hhhhhhhhhh.",
  ".hhhhhhhhhh.",
  "..hhhhhhhh..",
  "..ssssssss..",
  "..ssssssss..",
  "...ssssss...",
];

const HEAD_SIDE = [
  "....hhhh....",
  "..hhhhhhhh..",
  ".hhhhhhhhhh.",
  ".hooooooooh.",
  "..sssssss...",
  "..ssssssos..",
  "..ssssssss..",
  "...ssssss...",
];

const BODY_FRONT = [
  "..cccccccc..",
  ".sccccccccs.",
  ".sccccccccs.",
  "..cccccccc..",
  "..pppppppp..",
];

const BODY_SIDE = [
  "..cccccccc..",
  "..cccccccc..",
  "..cccccccc..",
  "..cccccccc..",
  "..pppppppp..",
];

const LEGS_STAND = ["..ppp..ppp..", "..oo....oo..", "............"];
const LEGS_STEP = ["...pp..pp...", "...oo..oo...", "............"];
const LEGS_SIDE_STAND = ["...pppppp...", "...oo.oo....", "............"];
const LEGS_SIDE_STEP = ["..ppp.ppp...", "..oo...oo...", "............"];

const HATS: Record<Exclude<JurySprite["hat"], "none">, string[]> = {
  chef: ["..aaaaaaaa..", ".aaaaaaaaaa.", ".aaaaaaaaaa."],
  cap: ["....aaaa....", "..aaaaaaaa..", ".aaaaaaaaaaa"],
  beret: [".....aa.a...", "...aaaaaaa..", "..aaaaaaaaa."],
  sunhat: ["...aaaaaa...", "..aaaaaaaa..", "aaaaaaaaaaaa"],
  beanie: ["....aaaa....", "..aaaaaaaa..", ".aaaaaaaaaa."],
};

const BEAST = [
  ".....oooooo.....",
  "...ooccccccoo...",
  "..occcccccccco..",
  ".occcccccccccco.",
  ".ochhhhhhhhhhco.",
  "ochhhoohhhoohhco",
  "ochhhoohhhoohhco",
  "ochhhhhhhhhhhhco",
  "oaaaaaaaaaaaaaao",
  "oppppppppppppppo",
  ".oppppppppppppo.",
  ".oaaaaaaaaaaaao.",
  "..osssssssssso..",
  "..ohhhhhhhhhho..",
  "..ohho....ohho..",
  "..ooo.....ooo...",
];

function frame(head: string[], body: string[], legs: string[]): string[] {
  return [...head, ...body, ...legs];
}

function blank(
  width = PLAYER_W,
  height = PLAYER_H,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas is not supported");
  return { canvas, ctx };
}

function paint(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  ramp: SpriteRamp,
  top = 0,
): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const part = PARTS[row.charAt(x)];
      if (part !== undefined) {
        ctx.fillStyle = ramp[part];
        ctx.fillRect(x, top + y, 1, 1);
      }
    }
  });
}

function buildSprite(
  rows: string[],
  ramp: SpriteRamp,
  width = PLAYER_W,
  height = PLAYER_H,
): HTMLCanvasElement {
  const { canvas, ctx } = blank(width, height);
  paint(ctx, rows, ramp);
  return canvas;
}

let beast: HTMLCanvasElement | null = null;

export function beastSprite(): HTMLCanvasElement {
  beast ??= buildSprite(BEAST, BEAST_RAMP, BEAST_W, BEAST_W);
  return beast;
}

function mirror(sprite: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx } = blank();
  ctx.translate(PLAYER_W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(sprite, 0, 0);
  return canvas;
}

export type SpriteSet = Record<
  Direction,
  [HTMLCanvasElement, HTMLCanvasElement]
>;

let cached: SpriteSet | null = null;

export function playerSprites(): SpriteSet {
  if (cached !== null) return cached;
  const right: [HTMLCanvasElement, HTMLCanvasElement] = [
    buildSprite(frame(HEAD_SIDE, BODY_SIDE, LEGS_SIDE_STAND), PLAYER_RAMP),
    buildSprite(frame(HEAD_SIDE, BODY_SIDE, LEGS_SIDE_STEP), PLAYER_RAMP),
  ];
  cached = {
    down: [
      buildSprite(frame(HEAD_FRONT, BODY_FRONT, LEGS_STAND), PLAYER_RAMP),
      buildSprite(frame(HEAD_FRONT, BODY_FRONT, LEGS_STEP), PLAYER_RAMP),
    ],
    up: [
      buildSprite(frame(HEAD_BACK, BODY_FRONT, LEGS_STAND), PLAYER_RAMP),
      buildSprite(frame(HEAD_BACK, BODY_FRONT, LEGS_STEP), PLAYER_RAMP),
    ],
    right,
    left: [mirror(right[0]), mirror(right[1])],
  };
  return cached;
}

function hattedHead(hat: JurySprite["hat"]): string[] {
  if (hat === "none") return HEAD_FRONT;
  return [...HATS[hat], ...HEAD_FRONT.slice(HATS[hat].length)];
}

export const VOTING_SPRITE: JurySprite = {
  hat: "beanie",
  hair: "grey",
  outfit: "teal",
};

export const ARTIST_SPRITE: JurySprite = {
  hat: "beret",
  hair: "dark",
  outfit: "denim",
};

export const NEIGHBOUR_SPRITE: JurySprite = {
  hat: "sunhat",
  hair: "ginger",
  outfit: "khaki",
};

const PORTRAIT_H = PLAYER_H - LEGS_STAND.length;

interface Portrait {
  source: HTMLCanvasElement;
  box: Box;
  legColour: string | null;
}

function keyedPortrait(image: HTMLImageElement): Portrait | null {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width === 0 || height === 0) return null;
  const { canvas, ctx } = blank(width, height);
  ctx.drawImage(image, 0, 0);
  const frameData = ctx.getImageData(0, 0, width, height);
  keyOutBackground(frameData.data, width, height);
  const box = opaqueBounds(frameData.data, width, height);
  if (box === null) return null;
  ctx.putImageData(frameData, 0, 0);
  return {
    source: canvas,
    box,
    legColour: dominantColour(frameData.data, width, box),
  };
}

function avatarFrame(portrait: Portrait, legs: string[]): HTMLCanvasElement {
  const { canvas, ctx } = blank();
  const { box } = portrait;
  const rect = portraitRect(box, PLAYER_W, PORTRAIT_H);
  ctx.drawImage(
    portrait.source,
    box.x,
    box.y,
    box.width,
    box.height,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  );
  paint(
    ctx,
    legs,
    // Only the `p` and `o` pixels of the leg rows are painted, so the trousers are
    // the only slot the picture gets a say in.
    { ...PLAYER_RAMP, trousers: portrait.legColour ?? PLAYER_RAMP.trousers },
    PLAYER_H - legs.length,
  );
  return canvas;
}

/** All four facings wear the SAME portrait — one image is all the machine gives us —
 * and only the gait changes. Null falls back to `playerSprites()`. */
export function avatarSprites(image: HTMLImageElement): SpriteSet | null {
  const portrait = keyedPortrait(image);
  if (portrait === null) return null;
  const front: [HTMLCanvasElement, HTMLCanvasElement] = [
    avatarFrame(portrait, LEGS_STAND),
    avatarFrame(portrait, LEGS_STEP),
  ];
  const right: [HTMLCanvasElement, HTMLCanvasElement] = [
    avatarFrame(portrait, LEGS_SIDE_STAND),
    avatarFrame(portrait, LEGS_SIDE_STEP),
  ];
  return {
    down: front,
    up: front,
    right,
    left: [mirror(right[0]), mirror(right[1])],
  };
}

const people = new Map<string, HTMLCanvasElement>();

export function npcSprite(sprite: JurySprite): HTMLCanvasElement {
  const key = `${sprite.hat}/${sprite.hair}/${sprite.outfit}`;
  const cached = people.get(key);
  if (cached !== undefined) return cached;
  const built = buildSprite(
    frame(hattedHead(sprite.hat), BODY_FRONT, LEGS_STAND),
    jurySpriteRamp(sprite),
  );
  people.set(key, built);
  return built;
}
