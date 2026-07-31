// Making a generated sprite walkable, in the BROWSER at draw time — a Worker has no
// canvas. The white is keyed by flooding IN FROM THE EDGES rather than by threshold
// alone, so a subject in a white shirt keeps it where "every near-white pixel goes"
// would eat a hole through them.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tight on purpose: it survives JPEG-ish edges without claiming the highlights on a
 * white jacket, and the edge flood is what makes the tightness safe. */
export const WHITE_FLOOR = 232;

const BLACK_CEILING = 32;

const CLEAR = 8;

const LOWER_QUARTER = 0.25;

const BUCKET = 32;

function channels(
  data: Uint8ClampedArray,
  at: number,
): { r: number; g: number; b: number; a: number } {
  return {
    r: data[at] ?? 0,
    g: data[at + 1] ?? 0,
    b: data[at + 2] ?? 0,
    a: data[at + 3] ?? 0,
  };
}

function isNearWhite({
  r,
  g,
  b,
}: {
  r: number;
  g: number;
  b: number;
}): boolean {
  return r >= WHITE_FLOOR && g >= WHITE_FLOOR && b >= WHITE_FLOOR;
}

function isNearBlack({
  r,
  g,
  b,
}: {
  r: number;
  g: number;
  b: number;
}): boolean {
  return r <= BLACK_CEILING && g <= BLACK_CEILING && b <= BLACK_CEILING;
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function keyOutBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const seen = new Uint8Array(width * height);
  const queue: number[] = [];
  for (let x = 0; x < width; x += 1) {
    queue.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    queue.push(y * width, y * width + width - 1);
  }
  while (queue.length > 0) {
    const at = queue.pop();
    if (at === undefined) break;
    if (seen[at] === 1) continue;
    seen[at] = 1;
    if (!isNearWhite(channels(data, at * 4))) continue;
    data[at * 4 + 3] = 0;
    const x = at % width;
    const y = (at - x) / width;
    if (x > 0) queue.push(at - 1);
    if (x < width - 1) queue.push(at + 1);
    if (y > 0) queue.push(at - width);
    if (y < height - 1) queue.push(at + width);
  }
}

export function opaqueBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Box | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (channels(data, (y * width + x) * 4).a <= CLEAR) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * A bucketed histogram rather than a mean, because averaging a striped shirt with the
 * skin beside it gives a colour neither of them is. Near-white is background the flood
 * could not reach and near-black is the outline, so both are skipped.
 */
export function dominantColour(
  data: Uint8ClampedArray,
  width: number,
  box: Box,
): string | null {
  const totals = new Map<
    number,
    { r: number; g: number; b: number; n: number }
  >();
  const from = box.y + Math.floor(box.height * (1 - LOWER_QUARTER));
  for (let y = from; y < box.y + box.height; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) {
      const pixel = channels(data, (y * width + x) * 4);
      if (pixel.a <= CLEAR || isNearWhite(pixel) || isNearBlack(pixel))
        continue;
      const key =
        Math.floor(pixel.r / BUCKET) * 64 +
        Math.floor(pixel.g / BUCKET) * 8 +
        Math.floor(pixel.b / BUCKET);
      const bucket = totals.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
      totals.set(key, {
        r: bucket.r + pixel.r,
        g: bucket.g + pixel.g,
        b: bucket.b + pixel.b,
        n: bucket.n + 1,
      });
    }
  }
  let best: { r: number; g: number; b: number; n: number } | null = null;
  for (const bucket of totals.values()) {
    if (best === null || bucket.n > best.n) best = bucket;
  }
  if (best === null) return null;
  return toHex(
    Math.round(best.r / best.n),
    Math.round(best.g / best.n),
    Math.round(best.b / best.n),
  );
}

export function portraitRect(box: Box, width: number, height: number): Box {
  const scale = Math.min(width / box.width, height / box.height);
  const drawn = { width: box.width * scale, height: box.height * scale };
  return {
    x: (width - drawn.width) / 2,
    y: height - drawn.height,
    width: drawn.width,
    height: drawn.height,
  };
}
