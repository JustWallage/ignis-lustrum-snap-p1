import type { Bindings } from "../env";

/**
 * No R2 call can join a `db.batch`, so every ordering leaks one way or the other and only
 * ONE outcome is unacceptable: a row pointing at an object that is not there, which is a
 * player's snap gone. So the object is written BEFORE its row and deleted AFTER it, and
 * what leaks instead is an orphan nobody references — sweepable, because every live key
 * is either a `photos.r2_key` or `sprites/` + a `users.avatar_key`.
 *
 * A snap's key is GENERATED rather than derived from `photos.id` for that reason alone:
 * an autoincrement id does not exist until the insert has landed, so a derived key could
 * only ever be written after its row.
 */
function prefix(env: Bindings): string {
  return env.IMAGE_PREFIX ?? "";
}

export function newSnapKey(env: Bindings): string {
  return `${prefix(env)}snaps/${randomHandle()}`;
}

export function spriteObjectKey(env: Bindings, avatarKey: string): string {
  return `${prefix(env)}sprites/${avatarKey}`;
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
 * is the sweep rather than a nicety. */
export async function sweepImages(env: Bindings): Promise<void> {
  let page: R2ListOptions = { prefix: prefix(env) };
  for (;;) {
    const listed = await env.IMAGES.list(page);
    const keys = listed.objects.map((object) => object.key);
    if (keys.length > 0) await env.IMAGES.delete(keys);
    if (!listed.truncated) return;
    page = { ...page, cursor: listed.cursor };
  }
}
