import { GbButton } from "@/components/GbPending";
import type { PhotoLike } from "@/hooks/usePhotoLike";

/**
 * The heart, once, for every surface that offers one. It takes the hook's state instead
 * of calling the hook, because `SnapDialog` needs that same fetch for the uploader and
 * the verdict: two `useCachedFetch`es on one path are two requests, sharing nothing but
 * the cache they seed from.
 */
export function LikeButton({ photo, liking, toggle }: PhotoLike) {
  const current = photo.data;
  if (current === undefined) return null;
  return (
    // Busy until the COUNT has moved, not just until the POST landed: the number beside
    // the heart comes from the refetch, so clearing the indicator any earlier would
    // point at a stale tally.
    <GbButton
      className="gb-btn px-2 py-0.5"
      aria-pressed={current.likedByMe}
      busy={liking || photo.busy}
      onClick={() => {
        void toggle();
      }}
    >
      {current.likedByMe ? "♥" : "♡"} {current.likeCount}
    </GbButton>
  );
}
