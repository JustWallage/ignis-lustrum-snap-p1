// A ramp maps shade LETTERS rather than luminance, so a tile may spend its darkest slot
// on a bright colour — which is how flower petals come out pink.

import type { JuryPalette, JurySprite } from "@shared/juries";

export interface Ramp {
  lightest: string;
  light: string;
  dark: string;
  darkest: string;
}

const GRASS_LIGHTEST = "#b8e090";
const WALL_CREAM = "#f8e0b8";
const OUTLINE_BROWN = "#301c14";

const GRASS: Ramp = {
  lightest: GRASS_LIGHTEST,
  light: "#68b048",
  dark: "#2c7838",
  darkest: "#0c2418",
};

const TALL_GRASS: Ramp = {
  lightest: GRASS_LIGHTEST,
  light: "#78c050",
  dark: "#2c7838",
  darkest: "#0c3820",
};

const PATH: Ramp = {
  lightest: "#e8d0a0",
  light: "#c8a468",
  dark: "#98763c",
  darkest: "#40301c",
};

const SAND: Ramp = {
  lightest: "#fcf4d0",
  light: "#f0dca0",
  dark: "#d8b878",
  darkest: "#a08048",
};

const FLOWERS: Ramp = {
  lightest: GRASS_LIGHTEST,
  light: "#68b048",
  dark: "#e06890",
  darkest: "#f07098",
};

const TREE: Ramp = {
  lightest: GRASS_LIGHTEST,
  light: "#4c9838",
  dark: "#1c6830",
  darkest: "#0c3018",
};

const WATER: Ramp = {
  lightest: "#a8dcf8",
  light: "#5090d8",
  dark: "#2860a8",
  darkest: "#10305c",
};

const FLOOR: Ramp = {
  lightest: "#e0b078",
  light: "#c08c50",
  dark: "#a06c38",
  darkest: "#6c4420",
};

const SHELF: Ramp = {
  lightest: "#e8c088",
  light: "#5878c8",
  dark: "#c05038",
  darkest: "#402818",
};

// The tile draws the grass dither before the cup, so `.` and `l` are the ground and
// the metal gets the other two — which is what lets an object stand ON the ground
// rather than replace it.
const TROPHY: Ramp = {
  lightest: GRASS_LIGHTEST,
  light: "#68b048",
  dark: "#f8d860",
  darkest: "#8c5c14",
};

const ROOF: Ramp = {
  lightest: "#f8c0a8",
  light: "#e05038",
  dark: "#a82c24",
  darkest: "#501814",
};

const SIDE: Ramp = {
  lightest: WALL_CREAM,
  light: "#e0c090",
  dark: "#b07848",
  darkest: OUTLINE_BROWN,
};

const WALL: Ramp = {
  lightest: WALL_CREAM,
  light: "#78b0e0",
  dark: "#b07848",
  darkest: OUTLINE_BROWN,
};

const DOOR: Ramp = {
  lightest: WALL_CREAM,
  light: "#c08850",
  dark: "#8c5c2c",
  darkest: OUTLINE_BROWN,
};

export const TILE_RAMPS: Record<string, Ramp> = {
  ".": GRASS,
  t: TALL_GRASS,
  P: PATH,
  F: FLOWERS,
  s: SAND,
  T: TREE,
  W: WATER,
  R: ROOF,
  S: SIDE,
  H: WALL,
  D: DOOR,
  f: FLOOR,
  A: SHELF,
  Y: TROPHY,
};

export function rampFor(tile: string): Ramp {
  return TILE_RAMPS[tile] ?? GRASS;
}

/** A table of ramps per palette instead of a tint is 112 ramps that drift out of step
 * with the art the first time a tile is redrawn. */
const PALETTE_TINTS: Record<JuryPalette, string> = {
  sea: "#2878d8",
  sunset: "#f88030",
  ember: "#e03020",
  steel: "#8898b0",
  frost: "#c8f0ff",
  neon: "#e040c0",
  timber: "#a06828",
  candy: "#ff70b0",
};

const TINT_STRENGTH: Record<keyof Ramp, number> = {
  lightest: 0.2,
  light: 0.18,
  dark: 0.12,
  darkest: 0.05,
};

function channel(hex: string, at: number): number {
  return Number.parseInt(hex.slice(at, at + 2), 16);
}

function mix(base: string, tint: string, amount: number): string {
  const shifted = [1, 3, 5].map((at) => {
    const from = channel(base, at);
    const value = Math.round(from + (channel(tint, at) - from) * amount);
    return value.toString(16).padStart(2, "0");
  });
  return `#${shifted.join("")}`;
}

export function themedRampFor(tile: string, palette: JuryPalette): Ramp {
  const base = rampFor(tile);
  const tint = PALETTE_TINTS[palette];
  return {
    lightest: mix(base.lightest, tint, TINT_STRENGTH.lightest),
    light: mix(base.light, tint, TINT_STRENGTH.light),
    dark: mix(base.dark, tint, TINT_STRENGTH.dark),
    darkest: mix(base.darkest, tint, TINT_STRENGTH.darkest),
  };
}

export interface SpriteRamp {
  outline: string;
  skin: string;
  hair: string;
  hat: string;
  shirt: string;
  trousers: string;
}

const SPRITE_INK = "#181820";
const SKIN = "#f8c088";

export const PLAYER_RAMP: SpriteRamp = {
  outline: SPRITE_INK,
  skin: SKIN,
  hair: "#8c3c18",
  // The player draws no hat; the slot is filled so no ramp is incomplete.
  hat: "#e04038",
  shirt: "#e04038",
  trousers: "#3c58a8",
};

/** A `SpriteRamp` because the beast is drawn by the same `paint`, but the six slots are
 * spent on a beast: hide, shell, belly, maw and teeth. */
export const BEAST_RAMP: SpriteRamp = {
  outline: SPRITE_INK,
  skin: "#f8e0b8",
  hair: "#68b048",
  hat: "#f8f8f8",
  shirt: "#1c6830",
  trousers: "#d84038",
};

const JURY_HAIR: Record<JurySprite["hair"], string> = {
  dark: "#3c2820",
  blond: "#e8c060",
  grey: "#d8d8e0",
  ginger: "#c85820",
};

const JURY_OUTFITS: Record<
  JurySprite["outfit"],
  { shirt: string; trousers: string }
> = {
  whites: { shirt: "#f8f8f8", trousers: "#c0c4cc" },
  denim: { shirt: "#5878c8", trousers: "#38487c" },
  suit: { shirt: "#40405c", trousers: "#20202c" },
  khaki: { shirt: "#c8b070", trousers: "#8c7844" },
  black: { shirt: "#302838", trousers: "#181420" },
  teal: { shirt: "#289890", trousers: "#1c6058" },
};

const HAT_COLOURS: Record<Exclude<JurySprite["hat"], "none">, string> = {
  chef: "#f8f8f8",
  cap: "#d84038",
  beret: "#8c2038",
  sunhat: "#e8c880",
  beanie: "#e05038",
};

export function jurySpriteRamp(sprite: JurySprite): SpriteRamp {
  const hair = JURY_HAIR[sprite.hair];
  const outfit = JURY_OUTFITS[sprite.outfit];
  return {
    outline: SPRITE_INK,
    skin: SKIN,
    hair,
    // A hatless jury still needs the slot filled, and hair cannot look wrong.
    hat: sprite.hat === "none" ? hair : HAT_COLOURS[sprite.hat],
    shirt: outfit.shirt,
    trousers: outfit.trousers,
  };
}
