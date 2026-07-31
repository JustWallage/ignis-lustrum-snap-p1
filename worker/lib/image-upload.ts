const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_SIZE = 1_200_000;

export type ImageUpload = { file: File } | { error: string };

export function readImageFile(form: FormData, field: string): ImageUpload {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) {
    return { error: "A photo is required" };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { error: "Only JPEG, PNG, WebP and GIF are allowed" };
  }
  if (file.size > MAX_SIZE) {
    return { error: "Photo must be under 1.2 MB" };
  }
  return { file };
}

export function isWithinImageCap(base64: string): boolean {
  // 3 bytes per 4 characters; padding overestimates by at most two bytes.
  return (base64.length * 3) / 4 <= MAX_SIZE;
}
