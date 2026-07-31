import { useCallback, useEffect, useState } from "react";
import { avatarStateSchema, type AvatarState } from "@shared/api";
import { avatarSprites, type SpriteSet } from "@/game/player";
import { apiFetch, readApiError } from "@/lib/api";

export function useMyAvatar(userId: number | null): {
  sprites: SpriteSet | null;
  quota: AvatarState | null;
  discard: () => Promise<void>;
  refresh: () => void;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [quota, setQuota] = useState<AvatarState | null>(null);
  const [sprites, setSprites] = useState<SpriteSet | null>(null);

  const refresh = useCallback(() => {
    if (userId === null) {
      setUrl(null);
      setQuota(null);
      return;
    }
    apiFetch("/api/avatar", avatarStateSchema)
      .then((state) => {
        setUrl(state.avatar?.url ?? null);
        setQuota(state);
      })
      .catch(() => {
        setUrl(null);
        setQuota(null);
      });
  }, [userId]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (url === null) {
      setSprites(null);
      return;
    }
    let live = true;
    const image = new Image();
    image.onload = () => {
      if (live) setSprites(avatarSprites(image));
    };
    image.onerror = () => {
      if (live) setSprites(null);
    };
    image.src = url;
    return () => {
      live = false;
    };
  }, [url]);

  const discard = useCallback(async () => {
    const res = await fetch("/api/avatar", { method: "DELETE" });
    if (!res.ok) {
      throw new Error(await readApiError(res, "Could not take it off."));
    }
    // Parsed rather than assumed: discarding hands no slot back, and `remaining` is
    // what refuses `[Draw me]` at the choice, so it must not quietly reset.
    const state = avatarStateSchema.parse(await res.json());
    setUrl(state.avatar?.url ?? null);
    setQuota(state);
  }, []);

  return { sprites, quota, discard, refresh };
}
