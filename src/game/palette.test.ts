import {
  JURIES,
  juryPaletteSchema,
  jurySpriteSchema,
  type JurySprite,
} from "@shared/juries";
import { MAP_ROWS } from "@shared/map";
import { describe, expect, it } from "vitest";
import {
  jurySpriteRamp,
  PLAYER_RAMP,
  type Ramp,
  rampFor,
  type SpriteRamp,
  themedRampFor,
  TILE_RAMPS,
} from "./palette";

const PLACED = [...new Set(MAP_ROWS.join("").split(""))].sort();

const HEX = /^#[0-9a-f]{6}$/;

const SLOTS = ["lightest", "light", "dark", "darkest"] as const;

// Listed rather than `Object.values`, which widens an interface to `any[]`.
function shades(ramp: Ramp): string[] {
  return [ramp.lightest, ramp.light, ramp.dark, ramp.darkest];
}

function distance(a: string, b: string): number {
  return Math.hypot(
    ...[1, 3, 5].map(
      (at) =>
        Number.parseInt(a.slice(at, at + 2), 16) -
        Number.parseInt(b.slice(at, at + 2), 16),
    ),
  );
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

  it("covers exactly the legend documented in shared/map.ts", () => {
    expect(Object.keys(TILE_RAMPS).sort()).toEqual([
      ".",
      "A",
      "D",
      "F",
      "H",
      "P",
      "R",
      "S",
      "T",
      "W",
      "Y",
      "f",
      "s",
      "t",
    ]);
    expect(Object.keys(TILE_RAMPS).sort()).toEqual(PLACED);
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

describe("themedRampFor", () => {
  const PALETTES = juryPaletteSchema.options;

  it("gives every palette four opaque hex colours for every tile", () => {
    for (const palette of PALETTES) {
      for (const tile of Object.keys(TILE_RAMPS)) {
        const ramp = themedRampFor(tile, palette);
        for (const colour of shades(ramp)) {
          expect(colour, `${palette} "${tile}"`).toMatch(HEX);
        }
        expect(new Set(shades(ramp)).size, `${palette} "${tile}"`).toBe(4);
      }
    }
  });

  it("paints the same tile differently under every palette", () => {
    const grass = PALETTES.map((palette) =>
      shades(themedRampFor(".", palette)).join(","),
    );
    expect(new Set(grass).size).toBe(PALETTES.length);
  });

  it("tints the art rather than replacing it: water still reads as water", () => {
    for (const palette of PALETTES) {
      for (const slot of SLOTS) {
        const themed = themedRampFor("W", palette)[slot];
        expect(distance(themed, rampFor("W")[slot]), palette).toBeLessThan(
          distance(themed, rampFor("R")[slot]),
        );
      }
    }
  });

  it("leaves the darkest shade, which every tile is outlined in, nearly where it was", () => {
    for (const palette of PALETTES) {
      const drift = distance(
        themedRampFor("T", palette).darkest,
        rampFor("T").darkest,
      );
      expect(drift, palette).toBeLessThan(24);
    }
  });

  it("falls back to grass off the legend, exactly as the untinted ramp does", () => {
    for (const palette of PALETTES) {
      expect(themedRampFor("?", palette)).toEqual(themedRampFor(".", palette));
    }
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
