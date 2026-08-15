import { avatarSprites, type SpriteSet } from "@/game/player";

type Entry =
  | { status: "loading" }
  | { status: "ready"; sprites: SpriteSet }
  | { status: "failed" };

const MAX_CACHED = 24;

const cache = new Map<string, Entry>();

const waiting = new Map<string, Set<() => void>>();

function settle(url: string, entry: Entry): void {
  cache.set(url, entry);
  const listeners = waiting.get(url);
  waiting.delete(url);
  listeners?.forEach((listener) => {
    listener();
  });
}

/** The render loop re-asks every frame, so a miss needs no telling there; a character
 * drawn ONCE into its own canvas would keep the fallback it mounted with. A failure
 * notifies too — the fallback is then the answer, not a wait. */
export function whenSpritesSettle(
  url: string | null,
  then: () => void,
): (() => void) | undefined {
  if (url === null) return undefined;
  const known = cache.get(url);
  if (known !== undefined && known.status !== "loading") return undefined;
  const listeners = waiting.get(url) ?? new Set<() => void>();
  listeners.add(then);
  waiting.set(url, listeners);
  return () => {
    listeners.delete(then);
  };
}

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
    settle(
      url,
      sprites === null ? { status: "failed" } : { status: "ready", sprites },
    );
  };
  image.onerror = () => {
    settle(url, { status: "failed" });
  };
  image.src = url;
  return null;
}
