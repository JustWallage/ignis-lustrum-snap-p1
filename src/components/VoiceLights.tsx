import { nameLabel } from "@/game/presence";
import type { Channel } from "@/game/voice";

const HOLD_LABEL = "HOLD TO SPEAK";

const OTHERS_LABEL = "OTHERS SPEAKING";

export function VoiceLights({ channel }: { channel: Channel }) {
  return (
    <>
      <span className="gb-voice is-mine" data-testid="voice-mine">
        <span className="gb-voice-arrow" data-testid="voice-arrow" />
        <span className="gb-led" data-lit={channel.mine} />
        <span className="gb-voice-label">{HOLD_LABEL}</span>
      </span>
      <span className="gb-voice is-theirs" data-testid="voice-theirs">
        <span
          className="gb-led"
          data-hue="green"
          data-lit={channel.theirs !== null}
        />
        <span className="gb-voice-label">
          {channel.theirs === null ? OTHERS_LABEL : nameLabel(channel.theirs)}
        </span>
      </span>
    </>
  );
}
