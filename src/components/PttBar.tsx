import type { Voice } from "@/hooks/useVoice";

const PTT_LABEL =
  "Push to talk — a press is also what gives this screen its sound";

/**
 * Pointer CAPTURE, not a click: a thumb that slides off the bar mid-sentence must not
 * silently cut the transmission.
 */
export function PttBar({ voice }: { voice: Voice }) {
  return (
    <button
      type="button"
      className="gb-ptt"
      aria-label={PTT_LABEL}
      data-testid="ptt-bar"
      data-held={voice.channel.mine}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        voice.hold();
      }}
      onPointerUp={voice.release}
      onPointerCancel={voice.release}
      onLostPointerCapture={voice.release}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    />
  );
}
