import { readFileSync } from "node:fs";
import { join } from "node:path";
import jsQR from "jsqr";
import type { Locator } from "@playwright/test";
import {
  apiSignIn,
  expect,
  handSnapToJury,
  pressStart,
  test,
} from "./fixtures";

// Every other spec asserts an upload SUCCEEDED. This one hands the jury a QR code and
// reads it back, so a degraded pipeline (downscale, JPEG, base64, D1) fails loudly.
//
// The fixture is deliberately low density and under `compressImage`'s ceiling, so the
// JPEG re-encode is the only thing acting on it. Enlarging it to make a failure go away
// would be missing the point: it is a finding about the compression settings.

const QR_PAYLOAD = "IGNIS-SNAPS-ROUND-TRIP-OK";

const QR_FIXTURE = {
  name: "qr.png",
  mimeType: "image/png",
  buffer: readFileSync(join(import.meta.dirname, "qr-fixture.png")),
};

async function decodeQr(image: Locator): Promise<string | undefined> {
  const frame = await image.evaluate((el: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = el.naturalWidth;
    canvas.height = el.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("the page has no 2d context");
    ctx.drawImage(el, 0, 0);
    const { data, width, height } = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    // Chunked, because `fromCharCode` cannot take half a megabyte of arguments
    // at once and one growing string per byte is quadratic.
    const chunks: string[] = [];
    for (let at = 0; at < data.length; at += 8192) {
      chunks.push(String.fromCharCode(...data.subarray(at, at + 8192)));
    }
    return { rgba: btoa(chunks.join("")), width, height };
  });
  const rgba = Uint8ClampedArray.from(Buffer.from(frame.rgba, "base64"));
  return jsQR(rgba, frame.width, frame.height)?.data;
}

test("a QR code survives the upload round trip intact", async ({ page }) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await handSnapToJury(page, QR_FIXTURE);

  const dialog = page.locator(".gb-window");
  await expect(
    dialog.getByRole("heading", { name: "Snap", exact: true }),
  ).toBeVisible();

  const image = dialog.locator("img").first();
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  expect(await decodeQr(image)).toBe(QR_PAYLOAD);
});
