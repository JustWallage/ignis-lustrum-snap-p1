import { describe, expect, it } from "vitest";
import {
  dominantColour,
  keyOutBackground,
  opaqueBounds,
  portraitRect,
  WHITE_FLOOR,
  type Box,
} from "@/game/avatar";

const INK: [number, number, number] = [8, 8, 8];
const COLOURS: Record<string, [number, number, number]> = {
  ".": [255, 255, 255],
  W: [252, 250, 252],
  s: [248, 192, 136],
  c: [40, 152, 144],
  p: [152, 40, 152],
  q: [156, 44, 156],
  o: INK,
};

function pixels(rows: readonly string[]): Uint8ClampedArray {
  const width = rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * rows.length * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = COLOURS[row.charAt(x)] ?? INK;
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  });
  return data;
}

function alphaAt(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): number {
  return data[(y * width + x) * 4 + 3] ?? 0;
}

const IN_WHITES = [
  "........",
  "..ssss..",
  "..cccc..",
  ".cWWWWc.",
  ".cWWWWc.",
  "..pppp..",
  "........",
  "........",
] as const;

describe("keyOutBackground", () => {
  it("takes the background off and leaves a white shirt on", () => {
    const data = pixels(IN_WHITES);
    keyOutBackground(data, 8, IN_WHITES.length);

    expect(alphaAt(data, 8, 0, 0)).toBe(0);
    expect(alphaAt(data, 8, 7, 7)).toBe(0);
    expect(alphaAt(data, 8, 0, 3)).toBe(0);
    // The shirt is white too, and it is the whole point: the flood cannot reach
    // it, so it stays part of the person.
    for (const x of [2, 3, 4, 5]) {
      expect(alphaAt(data, 8, x, 3), `shirt at ${x},3`).toBe(255);
      expect(alphaAt(data, 8, x, 4), `shirt at ${x},4`).toBe(255);
    }
    expect(alphaAt(data, 8, 2, 2)).toBe(255);
  });

  it("keys a pixel by how white it is, not by where it is", () => {
    const grey = WHITE_FLOOR - 1;
    const data = new Uint8ClampedArray([
      grey,
      grey,
      grey,
      255,
      WHITE_FLOOR,
      WHITE_FLOOR,
      WHITE_FLOOR,
      255,
    ]);
    keyOutBackground(data, 2, 1);
    expect(alphaAt(data, 2, 0, 0)).toBe(255);
    expect(alphaAt(data, 2, 1, 0)).toBe(0);
  });
});

describe("opaqueBounds", () => {
  it("is the box the sprite is left in once the background is off", () => {
    const data = pixels(IN_WHITES);
    keyOutBackground(data, 8, IN_WHITES.length);
    expect(opaqueBounds(data, 8, IN_WHITES.length)).toEqual({
      x: 1,
      y: 1,
      width: 6,
      height: 5,
    });
  });

  it("is null when the key-out took everything", () => {
    const data = pixels(["....", "...."]);
    keyOutBackground(data, 4, 2);
    expect(opaqueBounds(data, 4, 2)).toBeNull();
  });
});

const TROUSERED = [
  "cccc",
  "cccc",
  "cccc",
  "cccc",
  "cccc",
  "cccc",
  "opqo",
  "o..o",
];

describe("dominantColour", () => {
  const box: Box = { x: 0, y: 0, width: 4, height: 8 };

  it("reads the trousers out of the lower quarter, ignoring ink and white", () => {
    expect(dominantColour(pixels(TROUSERED), 4, box)).toBe("#9a2a9a");
  });

  it("answers null when the lower quarter is only ink and white", () => {
    const rows = [
      "cccc",
      "cccc",
      "cccc",
      "cccc",
      "cccc",
      "cccc",
      "oooo",
      "....",
    ];
    expect(dominantColour(pixels(rows), 4, box)).toBeNull();
  });

  it("only reads the box it is given", () => {
    expect(
      dominantColour(pixels(TROUSERED), 4, { x: 0, y: 0, width: 4, height: 4 }),
    ).toBe("#289890");
  });
});

describe("portraitRect", () => {
  it("sits the waist cutoff flush on the bottom edge, whatever the shape", () => {
    for (const box of [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 5, y: 5, width: 200, height: 100 },
      { x: 0, y: 0, width: 100, height: 400 },
    ]) {
      const rect = portraitRect(box, 12, 13);
      expect(rect.y + rect.height, `box ${box.width}x${box.height}`).toBe(13);
      expect(rect.width).toBeLessThanOrEqual(12);
      expect(rect.height).toBeLessThanOrEqual(13);
    }
  });

  it("fills the width of the sprite box and centres what is narrower", () => {
    expect(
      portraitRect({ x: 0, y: 0, width: 100, height: 100 }, 12, 13),
    ).toEqual({ x: 0, y: 1, width: 12, height: 12 });
    expect(
      portraitRect({ x: 0, y: 0, width: 100, height: 200 }, 12, 12),
    ).toEqual({ x: 3, y: 0, width: 6, height: 12 });
  });
});
