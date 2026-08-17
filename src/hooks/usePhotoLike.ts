import { useCallback, useState } from "react";
import { photoSchema, type Photo } from "@shared/api";
import { useRealtimeEvents } from "@/context/WebSocketContext";
import { useCachedFetch, type CachedFetch } from "@/hooks/useCachedFetch";

export interface PhotoLike {
  photo: CachedFetch<Photo>;
  liking: boolean;
  toggle: () => Promise<void>;
}

/**
 * The heart's own state, fetched per photograph. `/api/days` carries the verdict but
 * no `likeCount`/`likedByMe`, and widening the day's results with two
 * fields the scoreboard has no business carrying would put them on every card — so the
 * one open photograph asks for itself, which is what `SnapDialog` already did.
 */
export function usePhotoLike(id: number): PhotoLike {
  const photo = useCachedFetch(`/api/photos/${id}`, photoSchema);
  const [liking, setLiking] = useState(false);

  const refresh = useCallback(() => {
    photo.mutate();
  }, [photo]);
  useRealtimeEvents(refresh);

  const toggle = useCallback(async () => {
    if (photo.data === undefined || liking) return;
    setLiking(true);
    try {
      await fetch(`/api/photos/${id}/like`, {
        method: photo.data.likedByMe ? "DELETE" : "POST",
      });
      photo.mutate();
    } finally {
      setLiking(false);
    }
  }, [id, liking, photo]);

  return { photo, liking, toggle };
}
