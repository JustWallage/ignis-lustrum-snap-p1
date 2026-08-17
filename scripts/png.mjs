import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_unused, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, payload) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), payload])), 0);
  return Buffer.concat([head, payload, crc]);
}

/** `palette` is `{ rgb: "#rrggbb", alpha }` entries; `rows` index into it. */
export function png(rows, palette) {
  const rgba = palette.map((entry) => {
    const [r, g, b] = Buffer.from(entry.rgb.slice(1), "hex");
    return [r, g, b, entry.alpha];
  });
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  // Colour type 6 (RGBA), not 3 (palette+tRNS): the indexed encoding was the last
  // artefact-level difference from the reference PWA that demonstrably installs.
  header[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  let at = 0;
  for (const row of rows) {
    raw[at] = 0;
    at += 1;
    for (const index of row) {
      raw.set(rgba[index], at);
      at += 4;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
