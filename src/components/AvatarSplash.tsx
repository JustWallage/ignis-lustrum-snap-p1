import type { AvatarState } from "@shared/api";
import { GbWindow } from "@/components/GbWindow";

export function AvatarSplash({
  state,
  onDiscard,
  onClose,
}: {
  state: AvatarState;
  onDiscard: () => void;
  onClose: () => void;
}) {
  return (
    <GbWindow title="Your new look" onClose={onClose}>
      <div className="space-y-3" data-testid="avatar-splash">
        {state.avatar !== null && (
          <img
            src={state.avatar.url}
            alt="Your new avatar"
            data-testid="avatar-sprite"
            className="gb-avatar-splash mx-auto h-48 w-48 border-2 border-[#071821] object-contain"
          />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className="gb-btn flex-1"
            data-testid="avatar-ok"
            onClick={onClose}
          >
            OK
          </button>
          <button
            type="button"
            className="gb-btn flex-1"
            data-testid="avatar-discard"
            onClick={onDiscard}
          >
            Discard
          </button>
        </div>
      </div>
    </GbWindow>
  );
}
