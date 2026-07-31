import { avatarSprites, type SpriteSet } from "@/game/player";

type Entry =
  | { status: "loading" }
  | { status: "ready"; sprites: SpriteSet }
  | { status: "failed" };

const MAX_CACHED = 24;

const cache = new Map<string, Entry>();

/** SYNCHRONOUS on purpose: the render loop calls it every frame for every friend on
 * screen. A miss starts the load and returns null; a failed entry is NEVER retried. */
export function remoteSprites(url: string | null): SpriteSet | null {
  if (url === null) return null;
  const known = cache.get(url);
  if (known !== undefined) {
    return known.status === "ready" ? known.sprites : null;
  }
  cache.set(url, { status: "loading" });
  // Insertion order is the eviction order: oldest first.
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next();
    if (oldest.done === true) break;
    cache.delete(oldest.value);
  }
  const image = new Image();
  image.onload = () => {
    const sprites = avatarSprites(image);
    cache.set(
      url,
      sprites === null ? { status: "failed" } : { status: "ready", sprites },
    );
  };
  image.onerror = () => {
    cache.set(url, { status: "failed" });
  };
  image.src = url;
  return null;
}
