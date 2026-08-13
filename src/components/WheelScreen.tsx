import { useEffect, useRef, useState } from "react";
import { wheelProgress, type EventState } from "@shared/events";
import { EventSnap } from "@/components/EventSnap";
import { useAuth } from "@/context/AuthContext";
import { useEvent } from "@/context/EventContext";
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
  prize,
  onDone,
}: {
  event: EventState;
  prize: string;
  onDone: () => void;
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
          <p className="gb-reveal-name" data-testid="wheel-winner-name">
            {winner.uploader.name.toUpperCase()}
          </p>
        </>
      )}
      <button
        type="button"
        className="gb-wheel-spin"
        data-testid="event-done"
        onClick={onDone}
      >
        DONE
      </button>
    </>
  );
}

export function WheelScreen({
  event,
  onDone,
}: {
  event: EventState;
  onDone: () => void;
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

  // Keyed off what is on screen rather than a schedule, so a screen that joined
  // mid-spin makes exactly the noises the rest of the spin still has in it. The tick
  // counts `offset`, so how many copies of the strip are rendered has no say.
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

  if (landed && prize !== undefined) {
    return <LastPage event={event} prize={prize} onDone={onDone} />;
  }

  return (
    <>
      <p className="gb-event-line">
        {/* Only the winner has a button, so only the winner is told to press
            one. Everybody else is watching, and reading an instruction meant for
            somebody else is how a room ends up looking for a control it has. */}
        {mine ? "SPIN FOR YOUR PRIZE" : "THE WINNER IS SPINNING"}
      </p>
      <div
        className="gb-wheel"
        data-testid="wheel"
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
