import { useCallback, useState } from "react";
import { townAvatarsSchema, type User } from "@shared/api";
import { CommentThread } from "@/components/CommentThread";
import { GbButton, GbPlaceholder } from "@/components/GbPending";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { readApiError } from "@/lib/api";

interface Face {
  id: number;
  url: string;
  worn: boolean;
  user: User;
}

/**
 * Every sprite the town has ever drawn, or only your own — the artist's wardrobe and the
 * archive's shelf are the same grid asking for a different slice of one listing, so a
 * player cannot be offered one set of faces in one place and another set in the other.
 */
export function AvatarGallery({
  mineOnly,
  onWorn,
}: {
  mineOnly: boolean;
  onWorn: () => void;
}) {
  const { user } = useAuth();
  const town = useCachedFetch("/api/avatars", townAvatarsSchema);
  const [open, setOpen] = useState<number | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [wearing, setWearing] = useState<number | null>(null);
  useRealtimeEvents(town.mutate);

  const players = (town.data?.players ?? []).filter(
    (player) => !mineOnly || player.user.id === user?.id,
  );
  const faces: Face[] = players.flatMap((player) =>
    player.sprites.map((sprite) => ({ ...sprite, user: player.user })),
  );
  // Resolved out of the LIST on every render rather than held as an object: the listing
  // refetches on every `avatar_changed`, and a stored face would keep saying "worn" the
  // moment somebody put a different one on.
  const shown = faces.find((face) => face.id === open);

  const wear = useCallback(
    async (id: number) => {
      setWearing(id);
      try {
        const res = await fetch("/api/avatar/worn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        setRefusal(
          res.ok ? null : await readApiError(res, "That one would not go on."),
        );
        if (!res.ok) return;
        town.mutate();
        // The push skips the socket that asked, so the wearer's own corner and walking
        // sprite are refreshed here rather than waiting on a frame that never comes.
        onWorn();
      } finally {
        setWearing(null);
      }
    },
    [onWorn, town],
  );

  if (faces.length === 0) {
    return (
      <GbPlaceholder
        error={town.error}
        loading={town.loading}
        testId="archive-faces-empty"
      >
        Nobody has been drawn yet. The artist is by the pond.
      </GbPlaceholder>
    );
  }

  return (
    <>
      <div data-testid="archive-faces">
        {players.map((player) => (
          <section
            key={player.user.id}
            className="arc-shelf"
            data-testid="archive-shelf"
          >
            <h3 className="arc-face-name">{player.user.name}</h3>
            <ul className="arc-faces">
              {player.sprites.map((sprite) => (
                <li
                  key={sprite.id}
                  className="arc-face"
                  data-testid="archive-face"
                >
                  <button
                    type="button"
                    className="arc-face-open"
                    aria-label={`Open ${player.user.name}'s avatar`}
                    onClick={() => {
                      setRefusal(null);
                      setOpen(sprite.id);
                    }}
                  >
                    <img
                      loading="lazy"
                      src={sprite.url}
                      alt={`${player.user.name}'s avatar`}
                      className="arc-face-shot"
                    />
                  </button>
                  {sprite.worn && (
                    <span
                      className="arc-face-worn"
                      data-testid="archive-face-worn"
                    >
                      Wearing
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {shown !== undefined && (
        <Modal
          label={`${shown.user.name}'s avatar`}
          onClose={() => {
            setOpen(null);
          }}
        >
          <div className="arc-face-sheet" data-testid="avatar-sheet">
            <img
              src={shown.url}
              alt={`${shown.user.name}'s avatar`}
              className="arc-face-shot"
            />
            <p className="arc-face-name">{shown.user.name}</p>
            {shown.user.id === user?.id && (
              <GbButton
                className="gb-btn w-full"
                data-testid="avatar-wear"
                busy={wearing === shown.id}
                disabled={shown.worn}
                onClick={() => {
                  void wear(shown.id);
                }}
              >
                {shown.worn ? "Wearing this" : "Wear this one"}
              </GbButton>
            )}
            {refusal !== null && (
              <p
                className="gb-error"
                role="alert"
                data-testid="avatar-wear-error"
              >
                {refusal}
              </p>
            )}
            <CommentThread subject="avatar" id={shown.id} />
          </div>
        </Modal>
      )}
    </>
  );
}
