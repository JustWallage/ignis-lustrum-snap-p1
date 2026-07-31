import { townAvatarsSchema } from "@shared/api";
import { GbPlaceholder } from "@/components/GbPending";
import { useRealtimeEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";

export function AvatarGallery() {
  const town = useCachedFetch("/api/avatars", townAvatarsSchema);
  useRealtimeEvents(town.mutate);

  const avatars = town.data?.avatars ?? [];

  if (avatars.length === 0) {
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
    <ul className="arc-faces" data-testid="archive-faces">
      {avatars.map(({ user, url }) => (
        <li key={user.id} className="arc-face" data-testid="archive-face">
          <img
            loading="lazy"
            src={url}
            alt={`${user.name}'s avatar`}
            className="arc-face-shot"
          />
          <span className="arc-face-name">{user.name}</span>
        </li>
      ))}
    </ul>
  );
}
