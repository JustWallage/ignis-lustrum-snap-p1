// GENERATED, not drawn in an editor: ONE 32x32 source, every output a WHOLE-number
// nearest-neighbour scale of it, and the palette is the app's own. Run
// `node scripts/icons.mjs` and commit the PNGs — nothing in the build regenerates them.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { png } from "./png.mjs";

const OUT = path.resolve(import.meta.dirname, "..", "public");

const ART = [
  "....SSSSSSSSSSSSSSSSSSSSSSSS....",
  "..SSSSSSSSSSSSSSSSSSSSSSSSSSSS..",
  ".SSSSSSSSSSSSSSSSSSSSSSSSSSSSSS.",
  ".SSNNNNNNNNNNNNNNNNNNNNNNNNNNSS.",
  "SSSNGGGGGGGGGGGGGGGGGGGGGGGGNSSS",
  "SSSNGRRGGGGGNNNNNNNNGGGGGGGGNSSS",
  "SSSNGRRGGGNNMMMMMMMMNNGGGGGGNSSS",
  "SSSNGGGGGNMMMKKKKKKMMMNGGGGGNSSS",
  "SSSNGGGGNMMKKKKKKKKKKMMNGGGGNSSS",
  "SSSNGGGNMMKKKDDDDDDKKKMMNGGGNSSS",
  "SSSNGGNMMKKKDDMMMMDDKKKMMNGGNSSS",
  "SSSNGGNMKKKWWMMMMMMMDKKKMNGGNSSS",
  "SSSNGNMMKKDWWMMMMMMMMDKKMMNGNSSS",
  "SSSNGNMKKDDMMMKKKKMMMDDKKMNGNSSS",
  "SSSNGNMKKDMMMKKKKKKMMMDKKMNGNSSS",
  "SSSNGNMKKDMMMKKKKKKMMMDKKMNGNSSS",
  "SSSNGNMKKDMMMKKKKKKMMMDKKMNGNSSS",
  "SSSNGNMKKDMMMKKKKKKMMMDKKMNGNSSS",
  "SSSNGNMKKDDMMMKKKKMMMDDKKMNGNSSS",
  "SSSNGNMMKKDMMMMMMMMMMDKKMMNGNSSS",
  "SSSNGGNMKKKDMMMMMMMMDKKKMNGGNSSS",
  "SSSNGGNMMKKKDDMMMMDDKKKMMNGGNSSS",
  "SSSNGGGNMMKKKDDDDDDKKKMMNGGGNSSS",
  "SSSNGGGGNMMKKKKKKKKKKMMNGGGGNSSS",
  "SSSNGGGGGNMMMKKKKKKMMMNGGGGGNSSS",
  "SSSNGGGGGGNNMMMMMMMMNNGGGGGGNSSS",
  "SSSNGGGGGGGGNNNNNNNNGGGGGGGGNSSS",
  "SSSNGGGGGGGGGGGGGGGGGGGGGGGGNSSS",
  ".SSNNNNNNNNNNNNNNNNNNNNNNNNNNSS.",
  ".SSSSSSSSSSSSSSSSSSSSSSSSSSSSSS.",
  "..SSSSSSSSSSSSSSSSSSSSSSSSSSSS..",
  "....SSSSSSSSSSSSSSSSSSSSSSSS....",
];

const ART_SIZE = ART.length;

const PALETTE = [
  { key: ".", rgb: "#000000", alpha: 0 },
  { key: "S", rgb: "#c9c5bc", alpha: 255 },
  { key: "N", rgb: "#202830", alpha: 255 },
  { key: "G", rgb: "#b8e090", alpha: 255 },
  { key: "M", rgb: "#68b048", alpha: 255 },
  { key: "D", rgb: "#2c7838", alpha: 255 },
  { key: "K", rgb: "#0c2418", alpha: 255 },
  { key: "W", rgb: "#f8f8f8", alpha: 255 },
  { key: "R", rgb: "#e23b3b", alpha: 255 },
  { key: "_", rgb: "#23252b", alpha: 255 },
];

const INDEX_OF = new Map(PALETTE.map((entry, index) => [entry.key, index]));

const OUTPUTS = [
  { name: "icon-32.png", size: 32 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-maskable-512.png", size: 512, scale: 12, background: "_" },
];

function raster(size, scale, background) {
  const drawn = ART_SIZE * scale;
  const offset = Math.floor((size - drawn) / 2);
  const fill = INDEX_OF.get(background);
  if (fill === undefined) throw new Error(`no palette entry "${background}"`);
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = new Uint8Array(size).fill(fill);
    const sy = Math.floor((y - offset) / scale);
    if (sy >= 0 && sy < ART_SIZE) {
      const line = ART[sy];
      for (let x = 0; x < size; x++) {
        const sx = Math.floor((x - offset) / scale);
        if (sx < 0 || sx >= ART_SIZE) continue;
        if (line[sx] === ".") continue;
        const index = INDEX_OF.get(line[sx]);
        if (index === undefined) {
          throw new Error(`row ${sy} uses "${line[sx]}", which has no colour`);
        }
        row[x] = index;
      }
    }
    rows.push(row);
  }
  return rows;
}

for (const row of ART) {
  if (row.length !== ART_SIZE) {
    throw new Error(`the art is ${ART_SIZE} tall but a row is ${row.length}`);
  }
}

for (const {
  name,
  size,
  scale = size / ART_SIZE,
  background = ".",
} of OUTPUTS) {
  if (!Number.isInteger(scale)) {
    throw new Error(
      `${name} would scale the art by ${scale}, which smudges it`,
    );
  }
  const bytes = png(raster(size, scale, background), PALETTE);
  writeFileSync(path.join(OUT, name), bytes);
  process.stdout.write(
    `${name}: ${size}x${size}, ${scale}x the art, ${(bytes.length / 1024).toFixed(1)} KB\n`,
  );
}
