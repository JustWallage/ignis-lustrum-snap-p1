import { useEffect, useRef, useState } from "react";
import { wheelProgress, type EventState } from "@shared/events";
import { EventSnap } from "@/components/EventSnap";
import { useAuth } from "@/context/AuthContext";
import { useDayResults } from "@/hooks/useDayResults";
import { useNow } from "@/hooks/useNow";
import { readApiError } from "@/lib/api";
import { playCue } from "@/lib/sound";

const FRAME_MS = 16;

const TURNS = 4;

/**
 * DUPLICATED into `.gb-wheel-seg` / `.gb-wheel`: the ribbon is positioned in code, so
 * move one and the other moves with it or the wheel lands on the wrong segment. It is
 * also why `.gb-wheel` carries `flex: none` — a wheel SHRUNK by the flex column put the
 * marker off the centre of segment zero.
 */
const SEGMENT_CQW = 5.5;
const WHEEL_CQW = 33;

/** Whole PASSES, so the segment under the marker is still list index 0. Two and three
 * because the smallest legal wheel is `MIN_ENABLED_PRIZES` segments. */
const LEAD = 2;
const TRAIL = 3;

function ribbonOffset(event: EventState, now: number): number {
  const index = event.prizeIndex;
  if (index === null || event.segments.length === 0) return 0;
  const target = TURNS * event.segments.length + index;
  return target * wheelProgress(event, now);
}

function restingCqw(count: number): number {
  return (WHEEL_CQW - SEGMENT_CQW) / 2 - LEAD * count * SEGMENT_CQW;
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
  const now = useNow(FRAME_MS);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offset = ribbonOffset(event, now);
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
    // Deliberately NOT applying the response: the fan-out is the single path a phase
    // change reaches a screen by. The response is for the REFUSAL.
    const res = await fetch("/api/event/spin", { method: "POST" });
    if (!res.ok) {
      setError(await readApiError(res, "The wheel would not turn"));
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
      <div className="gb-wheel" data-testid="wheel">
        <div className="gb-wheel-marker" />
        <div
          className="gb-wheel-ribbon"
          style={{
            transform: `translateY(${String(
              restingCqw(event.segments.length) - offset * SEGMENT_CQW,
            )}cqw)`,
          }}
        >
          {/* Enough copies that the ribbon never runs out from under the marker
              in either direction: LEAD passes above where it starts, TURNS whole
              passes to travel, and TRAIL below where it lands. */}
          {Array.from({ length: LEAD + TURNS + TRAIL }, (_, pass) =>
            event.segments.map((label, index) => (
              <span
                className="gb-wheel-seg"
                key={`${String(pass)}-${String(index)}`}
              >
                {label.toUpperCase()}
              </span>
            )),
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
