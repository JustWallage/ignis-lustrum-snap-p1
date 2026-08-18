import { JURIES, jurySpriteSchema, type JurySprite } from "@shared/juries";
import { MAP_ROWS } from "@shared/map";
import { describe, expect, it } from "vitest";
import {
  jurySpriteRamp,
  PLAYER_RAMP,
  type Ramp,
  rampFor,
  type SpriteRamp,
  TILE_RAMPS,
} from "./palette";

const PLACED = [...new Set(MAP_ROWS.join("").split(""))].sort();

/** The lit cabinet is the one ramp no map character is — the same tile in its other state,
 * picked by the render loop off the shared playback rather than by the map. */
const UNPLACED = ["j"];

const HEX = /^#[0-9a-f]{6}$/;

// Listed rather than `Object.values`, which widens an interface to `any[]`.
function shades(ramp: Ramp): string[] {
  return [ramp.lightest, ramp.light, ramp.dark, ramp.darkest];
}

function parts(ramp: SpriteRamp): string[] {
  return [
    ramp.outline,
    ramp.skin,
    ramp.hair,
    ramp.hat,
    ramp.shirt,
    ramp.trousers,
  ];
}

const EVERY_LOOK: JurySprite[] = jurySpriteSchema.shape.hat.options.flatMap(
  (hat) =>
    jurySpriteSchema.shape.hair.options.flatMap((hair) =>
      jurySpriteSchema.shape.outfit.options.map((outfit) => ({
        hat,
        hair,
        outfit,
      })),
    ),
);

describe("TILE_RAMPS", () => {
  it("has a ramp for every tile type the map places", () => {
    // Without this, a terrain type added to shared/map.ts silently renders as
    // grass instead of failing — rampFor's fallback would swallow it.
    for (const tile of PLACED) {
      expect(TILE_RAMPS, `tile "${tile}"`).toHaveProperty(tile);
    }
  });

  it("covers exactly the legend documented in shared/map.ts, plus the lit cabinet", () => {
    expect(Object.keys(TILE_RAMPS).sort()).toEqual([
      ".",
      "A",
      "D",
      "F",
      "H",
      "J",
      "P",
      "R",
      "S",
      "T",
      "W",
      "Y",
      "f",
      "j",
      "s",
      "t",
    ]);
    expect(Object.keys(TILE_RAMPS).sort()).toEqual(
      [...PLACED, ...UNPLACED].sort(),
    );
  });

  it("gives the jukebox a ramp in both states, so neither draws as grass", () => {
    expect(TILE_RAMPS).toHaveProperty("J");
    expect(TILE_RAMPS).toHaveProperty("j");
    expect(rampFor("J")).not.toBe(rampFor("."));
    expect(rampFor("j")).not.toBe(rampFor("."));
    // ONE slot separates them, and it is the one every lamp spends.
    expect(rampFor("j").light).not.toBe(rampFor("J").light);
    expect(rampFor("j").dark).toBe(rampFor("J").dark);
  });

  it("gives every ramp four opaque hex colours", () => {
    for (const [tile, ramp] of Object.entries(TILE_RAMPS)) {
      for (const colour of shades(ramp)) {
        expect(colour, `tile "${tile}"`).toMatch(HEX);
      }
      expect(new Set(shades(ramp)).size, `tile "${tile}"`).toBe(4);
    }
  });

  it("is not four greens any more", () => {
    const dmg = new Set(["#e0f8cf", "#86c06c", "#306850", "#071821"]);
    for (const ramp of Object.values(TILE_RAMPS)) {
      for (const colour of shades(ramp)) {
        expect(dmg.has(colour)).toBe(false);
      }
    }
  });
});

describe("rampFor", () => {
  it("returns the tile's own ramp", () => {
    expect(rampFor("W")).toBe(TILE_RAMPS.W);
    expect(rampFor("A")).toBe(TILE_RAMPS.A);
    expect(rampFor("S")).not.toBe(rampFor("H"));
    expect(rampFor("S")).not.toBe(rampFor("R"));
  });

  it("falls back to grass off the legend, matching tileAt's own fallback", () => {
    expect(rampFor("?")).toBe(TILE_RAMPS["."]);
    expect(rampFor("")).toBe(TILE_RAMPS["."]);
  });
});

describe("sprite ramps", () => {
  it("paints people in hex colours, not shades", () => {
    for (const colour of parts(PLAYER_RAMP)) {
      expect(colour).toMatch(HEX);
    }
  });

  it("resolves every trait combination to a full ramp of hex colours", () => {
    for (const look of EVERY_LOOK) {
      const ramp = jurySpriteRamp(look);
      for (const colour of parts(ramp)) {
        expect(colour, JSON.stringify(look)).toMatch(HEX);
      }
    }
  });

  it("leaves a bare-headed jury's hat slot inert", () => {
    const ramp = jurySpriteRamp({
      hat: "none",
      hair: "dark",
      outfit: "denim",
    });
    expect(ramp.hat).toBe(ramp.hair);
  });

  it("dresses the player and today's jury differently", () => {
    const ramp = jurySpriteRamp(JURIES[0].sprite);
    expect(PLAYER_RAMP.shirt).not.toBe(ramp.shirt);
    expect(PLAYER_RAMP.trousers).not.toBe(ramp.trousers);
  });

  it("never dresses two consecutive days the same", () => {
    let previous = "";
    for (const jury of JURIES) {
      const look = parts(jurySpriteRamp(jury.sprite)).join(",");
      expect(look, jury.name).not.toBe(previous);
      previous = look;
    }
  });
});
