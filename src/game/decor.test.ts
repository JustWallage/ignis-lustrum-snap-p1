import { juryDecorSchema } from "@shared/juries";
import {
  ARTIST,
  isWalkableTile,
  JUKEBOX,
  JURY,
  NEIGHBOUR,
  type Point,
  tileAt,
  VOTING,
} from "@shared/map";
import { describe, expect, it } from "vitest";
import { DECOR, type DecorPiece } from "./decor";
import { isShade } from "./pixels";
import { TILE } from "./tiles";

const THEMES = juryDecorSchema.options;

const HEX = /^#[0-9a-f]{6}$/;

const PEOPLE: Point[] = [JURY, VOTING, ARTIST, NEIGHBOUR];

/** `e2e/town-decor.spec.ts` reads the canvas at two of these. */
const SIGNATURE: Point[] = [
  { x: 9, y: 4 },
  { x: 0, y: 6 },
  { x: 5, y: 8 },
];

function drawings(piece: DecorPiece) {
  return piece.alt === undefined ? [piece.rows] : [piece.rows, piece.alt];
}

function colours(piece: DecorPiece): string[] {
  return [
    piece.ramp.lightest,
    piece.ramp.light,
    piece.ramp.dark,
    piece.ramp.darkest,
  ];
}

function pieces(): { theme: string; piece: DecorPiece }[] {
  return THEMES.flatMap((theme) =>
    DECOR[theme].map((piece) => ({ theme, piece })),
  );
}

describe("DECOR", () => {
  it("hangs something on the town for every jury there is", () => {
    for (const theme of THEMES) {
      expect(DECOR[theme].length, theme).toBeGreaterThan(0);
      for (const piece of DECOR[theme]) {
        expect(piece.at.length, theme).toBeGreaterThan(0);
      }
    }
  });

  it("never stands a prop where somebody can walk", () => {
    for (const { theme, piece } of pieces()) {
      for (const spot of piece.at) {
        const tile = tileAt(spot.x, spot.y);
        expect(isWalkableTile(tile), `${theme} at ${spot.x},${spot.y}`).toBe(
          false,
        );
      }
    }
  });

  it("never hangs a prop on a person", () => {
    for (const { theme, piece } of pieces()) {
      for (const spot of piece.at) {
        const standing = PEOPLE.some((p) => p.x === spot.x && p.y === spot.y);
        expect(standing, `${theme} at ${spot.x},${spot.y}`).toBe(false);
      }
    }
  });

  // Anchors being solid only keeps a prop off walkable ground if its PIXELS stay in the
  // tile as well: a drawing taller than its offset allows spills onto the tile below.
  it("keeps every prop inside the tile it is hung on", () => {
    for (const { theme, piece } of pieces()) {
      for (const rows of drawings(piece)) {
        const width = rows[0]?.length ?? 0;
        expect(piece.dx, theme).toBeGreaterThanOrEqual(0);
        expect(piece.dy, theme).toBeGreaterThanOrEqual(0);
        expect(piece.dx + width, theme).toBeLessThanOrEqual(TILE);
        expect(piece.dy + rows.length, theme).toBeLessThanOrEqual(TILE);
      }
    }
  });

  // The cabinet is unwalkable, so a prop MAY legally be hung on it — and `e2e/jukebox.spec.ts`
  // reads a pixel of its lit window, which a prop over that tile would silently repaint.
  it("hangs nothing on the jukebox", () => {
    for (const { theme, piece } of pieces()) {
      expect(piece.at, theme).not.toContainEqual(JUKEBOX);
    }
  });

  it("draws in shades the painter knows, on a rectangle", () => {
    for (const { theme, piece } of pieces()) {
      for (const rows of drawings(piece)) {
        const width = rows[0]?.length ?? 0;
        expect(width, theme).toBeGreaterThan(0);
        let painted = 0;
        for (const row of rows) {
          expect(row.length, `${theme} "${row}"`).toBe(width);
          for (const mark of row) {
            expect(isShade(mark), `${theme} "${mark}"`).toBe(true);
            if (mark !== "-") painted += 1;
          }
        }
        expect(painted, theme).toBeGreaterThan(0);
      }
    }
  });

  it("paints every prop in four opaque hex colours", () => {
    for (const { theme, piece } of pieces()) {
      for (const colour of colours(piece)) {
        expect(colour, theme).toMatch(HEX);
      }
      expect(new Set(colours(piece)).size, theme).toBe(4);
    }
  });

  it("dresses the same three trees whatever the day", () => {
    for (const theme of THEMES) {
      const dressed = DECOR[theme].flatMap((piece) => [...piece.at]);
      for (const tree of SIGNATURE) {
        const found = dressed.some((p) => p.x === tree.x && p.y === tree.y);
        expect(found, `${theme} at ${tree.x},${tree.y}`).toBe(true);
      }
    }
  });

  it("gives no two juries the same day to look at", () => {
    const looks = THEMES.map((theme) =>
      DECOR[theme]
        .map((piece) => [...piece.rows, ...colours(piece)].join(""))
        .join("|"),
    );
    expect(new Set(looks).size).toBe(THEMES.length);
  });
});
