import { useEffect, useRef, useState } from "react";
import { isBeastOn, wheelProgress, type EventState } from "@shared/events";
import { BeastScreen } from "@/components/BeastScreen";
import { NamedCharacter } from "@/components/Crowd";
import { EventSnap } from "@/components/EventSnap";
import { useAuth } from "@/context/AuthContext";
import { useEvent } from "@/context/EventContext";
import { playerIn, wornBy, type CrowdPlayer } from "@/game/crowd";
import { useDayResults } from "@/hooks/useDayResults";
import { useNow } from "@/hooks/useNow";
import { playCue } from "@/lib/sound";
import { drumOf, isFacing } from "@/lib/wheel";

const FRAME_MS = 16;

const TURNS = 4;

function drumOffset(event: EventState, now: number): number {
  const index = event.prizeIndex;
  if (index === null || event.segments.length === 0) return 0;
  const target = TURNS * event.segments.length + index;
  return target * wheelProgress(event, now);
}

function LastPage({
  event,
  town,
  prize,
  onDone,
  onResults,
}: {
  event: EventState;
  town: CrowdPlayer[];
  prize: string;
  onDone: () => void;
  onResults: () => void;
}) {
  const results = useDayResults(event.day);
  const winner = results?.find(
    (result) => result.photoId === event.winnerPhotoId,
  );

  return (
    <>
      <p className="gb-event-line">AND THE PRIZE IS</p>
      <p className="gb-wheel-prize" data-testid="wheel-prize">
        {prize.toUpperCase()}
      </p>
      {winner !== undefined && (
        <>
          <EventSnap
            url={winner.url}
            alt="The winning snap"
            testId="wheel-winner-photo"
            title="The winning snap"
          />
          <NamedCharacter
            name={winner.uploader.name}
            url={wornBy(town, winner.uploader.id)}
            testId="wheel-winner-name"
          />
        </>
      )}
      <div className="gb-event-buttons">
        <button
          type="button"
          className="gb-wheel-spin"
          data-testid="event-done"
          onClick={onDone}
        >
          DONE
        </button>
        {/* The archive opens on its newest revealed day, which is the one that just
            played, so nothing has to be threaded through to say so. */}
        {winner !== undefined && (
          <button
            type="button"
            className="gb-wheel-spin"
            data-testid="event-results"
            onClick={onResults}
          >
            VIEW RESULTS
          </button>
        )}
      </div>
    </>
  );
}

export function WheelScreen({
  event,
  town,
  onDone,
  onResults,
}: {
  event: EventState;
  town: CrowdPlayer[];
  onDone: () => void;
  onResults: () => void;
}) {
  const { user } = useAuth();
  const { spin: turnWheel } = useEvent();
  const now = useNow(FRAME_MS);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offset = drumOffset(event, now);
  const drum = drumOf(event.segments.length);
  const landed = event.prizeIndex !== null && wheelProgress(event, now) >= 1;
  const prize =
    event.prizeIndex === null ? undefined : event.segments[event.prizeIndex];
  const mine = user !== null && event.winnerUserId === user.id;
  // Out of the TOWN, never off `EventState`: `/api/event` is one of the two public
  // reads, so a name on it would put content through the walking-is-public boundary.
  // Signed out `town` is empty, which is the right answer — the wheel and no name.
  const turning =
    event.winnerUserId === null ? null : playerIn(town, event.winnerUserId);

  // Keyed off what is on screen rather than a schedule, so a screen that joined
  // mid-spin makes exactly the noises the rest of the spin still has in it. The tick
  // counts `offset`, so how many copies of the list the barrel carries has no say.
  const passed = useRef(0);
  useEffect(() => {
    const segment = Math.floor(offset);
    if (segment !== passed.current) {
      passed.current = segment;
      if (segment > 0) playCue("wheelTick");
    }
  }, [offset]);
  const cheered = useRef(false);
  useEffect(() => {
    if (landed && !cheered.current) {
      cheered.current = true;
      playCue("fanfare");
    }
  }, [landed]);

  const spin = async () => {
    setSpinning(true);
    setError(null);
    const refusal = await turnWheel();
    if (refusal !== null) {
      setError(refusal);
      setSpinning(false);
    }
  };

  if (isBeastOn(event, now)) {
    return <BeastScreen event={event} town={town} now={now} />;
  }

  if (landed && prize !== undefined) {
    return (
      <LastPage
        event={event}
        town={town}
        prize={prize}
        onDone={onDone}
        onResults={onResults}
      />
    );
  }

  return (
    <>
      <p className="gb-event-line">
        {/* Only the winner has a button, so only the winner is told to press
            one. Everybody else is watching, and reading an instruction meant for
            somebody else is how a room ends up looking for a control it has. */}
        {mine ? "SPIN FOR YOUR PRIZE" : "THE WINNER IS SPINNING"}
      </p>
      {turning !== null && (
        <NamedCharacter
          name={turning.name}
          url={turning.url}
          testId="wheel-turn-name"
        />
      )}
      <div
        className="gb-wheel"
        data-testid="wheel"
        data-bowser={event.bowser}
        style={{
          height: `${drum.windowCqw.toFixed(3)}cqw`,
          perspective: `${drum.perspectiveCqw.toFixed(3)}cqw`,
        }}
      >
        <div
          className="gb-wheel-marker"
          style={{
            height: `${drum.slotCqw.toFixed(3)}cqw`,
            marginTop: `${(-drum.slotCqw / 2).toFixed(3)}cqw`,
          }}
        />
        <div
          className="gb-wheel-drum"
          style={{
            left: `${drum.insetPct.toFixed(3)}%`,
            right: `${drum.insetPct.toFixed(3)}%`,
            transform: `rotateX(${(-offset * drum.stepDeg).toFixed(3)}deg)`,
          }}
        >
          {Array.from({ length: drum.copies }, (_, copy) =>
            event.segments.map((label, index) => {
              const face = copy * event.segments.length + index;
              return (
                <span
                  className="gb-wheel-seg"
                  key={`${String(copy)}-${String(index)}`}
                  style={{
                    height: `${drum.faceCqw.toFixed(3)}cqw`,
                    marginTop: `${(-drum.faceCqw / 2).toFixed(3)}cqw`,
                    transform: `rotateX(${(face * drum.stepDeg).toFixed(3)}deg) translateZ(${drum.radiusCqw.toFixed(3)}cqw)`,
                    display: isFacing(drum, face, offset) ? "flex" : "none",
                  }}
                >
                  {label.toUpperCase()}
                </span>
              );
            }),
          )}
        </div>
      </div>
      {mine && event.prizeIndex === null && (
        <button
          type="button"
          className="gb-wheel-spin"
          data-testid="wheel-spin"
          disabled={spinning}
          onClick={() => {
            void spin();
          }}
        >
          {spinning ? "SPINNING" : "SPIN"}
        </button>
      )}
      {error !== null && <p className="gb-event-line">{error}</p>}
    </>
  );
}
