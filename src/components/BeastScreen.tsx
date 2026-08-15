import { beastProgress, type EventState } from "@shared/events";
import { Character, PixelSprite } from "@/components/Crowd";
import type { CrowdPlayer } from "@/game/crowd";
import { beastSprite } from "@/game/player";

const VICTIM_PCT = 50;

const EATEN_AT = 0.5;

const ENTERS_PCT = 115;

const LEAVES_PCT = -35;

function beastPct(progress: number): number {
  if (progress < EATEN_AT) {
    return ENTERS_PCT + (VICTIM_PCT - ENTERS_PCT) * (progress / EATEN_AT);
  }
  return (
    VICTIM_PCT +
    (LEAVES_PCT - VICTIM_PCT) * ((progress - EATEN_AT) / (1 - EATEN_AT))
  );
}

/** The first beat of the `wheel` phase, not a fourth reveal page — `podiumRank` is the
 * ONE field saying which of those is up. */
export function BeastScreen({
  event,
  town,
  now,
}: {
  event: EventState;
  town: CrowdPlayer[];
  now: number;
}) {
  const progress = beastProgress(event, now);
  const victim = town.find((one) => one.id === event.winnerUserId);

  return (
    <>
      <p className="gb-event-line">SOMETHING CAME FOR THE WINNER</p>
      <div className="gb-beast-stage" data-testid="beast">
        {progress < EATEN_AT && (
          <Character
            who={victim?.name ?? ""}
            url={victim?.url ?? null}
            style={{ left: `${String(VICTIM_PCT)}%` }}
          />
        )}
        <PixelSprite
          sprite={beastSprite()}
          className="gb-beast"
          style={{ left: `${beastPct(progress).toFixed(3)}%` }}
          testId="beast-figure"
        />
      </div>
    </>
  );
}
