import type { Bindings } from "../env";

/** Only what the bucket itself needs. Narrower than `Bindings` so the listing can be
 * driven straight from a test, where cf-typegen types every secret as optional. */
type ImageEnv = Pick<Bindings, "IMAGES"> & { IMAGE_PREFIX?: string };

export function imagePrefix(env: ImageEnv): string {
  return env.IMAGE_PREFIX ?? "";
}

/** GENERATED rather than derived from `photos.id`: an autoincrement id does not exist
 * until the insert has landed, so a derived key could only ever be written after its
 * row — and the object has to exist first. */
export function newSnapKey(env: Bindings): string {
  return `${imagePrefix(env)}snaps/${randomHandle()}`;
}

export function spriteObjectKey(env: Bindings, avatarKey: string): string {
  return `${imagePrefix(env)}sprites/${avatarKey}`;
}

export function randomHandle(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function putImage(
  env: Bindings,
  key: string,
  bytes: Uint8Array,
): Promise<void> {
  await env.IMAGES.put(key, bytes);
}

export async function readImage(
  env: Bindings,
  key: string | null,
): Promise<Uint8Array | null> {
  if (key === null) return null;
  const object = await env.IMAGES.get(key);
  if (object === null) return null;
  return new Uint8Array(await object.arrayBuffer());
}

export async function deleteImage(
  env: Bindings,
  key: string | null,
): Promise<void> {
  if (key === null) return;
  await env.IMAGES.delete(key);
}

/** R2 lists at most 1000 keys a page and deletes at most 1000 a call, so the cursor loop
 * is the listing rather than a nicety. `limit` is the page size only: a caller passing a
 * small one still gets everything, which is how the loop is proved without seeding a
 * thousand objects into the bucket every e2e run shares. */
async function eachPage(
  env: ImageEnv,
  limit: number | undefined,
  take: (objects: R2Object[]) => void | Promise<void>,
): Promise<void> {
  let page: R2ListOptions =
    limit === undefined
      ? { prefix: imagePrefix(env) }
      : { prefix: imagePrefix(env), limit };
  for (;;) {
    const listed = await env.IMAGES.list(page);
    await take(listed.objects);
    if (!listed.truncated) return;
    page = { ...page, cursor: listed.cursor };
  }
}

export async function sweepImages(env: ImageEnv): Promise<void> {
  await eachPage(env, undefined, async (objects) => {
    const keys = objects.map((object) => object.key);
    if (keys.length > 0) await env.IMAGES.delete(keys);
  });
}

export interface StoredObject {
  key: string;
  size: number;
}

export async function listImages(
  env: ImageEnv,
  limit?: number,
): Promise<StoredObject[]> {
  const found: StoredObject[] = [];
  await eachPage(env, limit, (objects) => {
    for (const object of objects) {
      found.push({ key: object.key, size: object.size });
    }
  });
  return found;
}
