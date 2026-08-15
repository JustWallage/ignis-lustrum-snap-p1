import { useCallback, useEffect, useState } from "react";
import { townAvatarsSchema } from "@shared/api";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeEvents } from "@/context/WebSocketContext";
import type { CrowdPlayer } from "@/game/crowd";
import { apiFetch } from "@/lib/api";

/** The town a crowd is drawn from — everybody, wearing whatever they have ON, which is
 * all a crowd needs out of the listing's sprite history. Signed out it asks for
 * NOTHING: sprites are content, and an anonymous screen that requested the roster would
 * be the leak, not the pixels it failed to draw. */
export function useTownAvatars(): CrowdPlayer[] {
  const { user } = useAuth();
  const [town, setTown] = useState<CrowdPlayer[]>([]);

  const load = useCallback(() => {
    if (user === null) {
      setTown([]);
      return;
    }
    apiFetch("/api/avatars", townAvatarsSchema)
      .then((fresh) => {
        setTown(
          fresh.players.map((player) => ({
            id: player.user.id,
            name: player.user.name,
            url: player.sprites.find((sprite) => sprite.worn)?.url ?? null,
          })),
        );
      })
      .catch(() => {
        setTown([]);
      });
  }, [user]);

  useEffect(load, [load]);
  useRealtimeEvents(load);

  return town;
}
