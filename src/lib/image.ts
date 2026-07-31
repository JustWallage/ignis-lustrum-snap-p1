const MAX_DIM = 1024;
const QUALITY = 0.82;

/** Encoded and DECLARED in one place: a `File` whose type disagrees with its bytes is
 * refused by the worker's allowlist for the wrong reason. */
const MIME = "image/jpeg";

/**
 * Mirrors the worker's allowlist, so a picker cannot let you choose something the
 * route will then refuse. Every file input reads it from here.
 */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/**
 * The one way a picked file becomes a request body. Every route this posts to reads the
 * field `photo` and re-checks the 1.2 MB cap, so a caller that skipped the downscale
 * would be a 400 on the phone the picker was opened from. Throws what `compressImage`
 * throws — an unreadable file, which every caller words its own way.
 */
export async function compressedPhotoForm(
  file: File,
  filename: string,
): Promise<FormData> {
  const compressed = await compressImage(file);
  const form = new FormData();
  form.append("photo", new File([compressed], filename, { type: MIME }));
  return form;
}

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Canvas is not supported in this browser");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, MIME, QUALITY);
  });
  if (blob === null) {
    throw new Error("Could not encode the image");
  }
  return blob;
}
