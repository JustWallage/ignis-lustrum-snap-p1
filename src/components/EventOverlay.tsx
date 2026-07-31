import { useEffect } from "react";
import { countdownSeconds, type EventState } from "@shared/events";
import { RevealScreen } from "@/components/RevealScreen";
import { WheelScreen } from "@/components/WheelScreen";
import { useNow } from "@/hooks/useNow";
import { playCue } from "@/lib/sound";

const REFRESH_MS = 100;

function CountdownScreen({ endsAt }: { endsAt: number | null }) {
  const now = useNow(REFRESH_MS);
  const seconds = countdownSeconds(endsAt, now);

  useEffect(() => {
    if (seconds !== null && seconds > 0) playCue("tick");
  }, [seconds]);

  return (
    <>
      <p className="gb-event-line">
        {seconds === 0 ? "THE JURY IS DECIDING" : "THE JUDGING BEGINS IN"}
      </p>
      {/* A dash rather than a zero when there is no target at all: a screen with
          nothing to count says so instead of claiming the time is up. */}
      <p className="gb-countdown" data-testid="countdown-seconds">
        {seconds ?? "-"}
      </p>
    </>
  );
}

export function EventOverlay({
  event,
  onHostNext,
  onDone,
}: {
  event: EventState;
  onHostNext: () => void;
  onDone: () => void;
}) {
  if (event.phase === "submission") return null;
  return (
    <div
      className="gb-event"
      data-testid="event-overlay"
      data-phase={event.phase}
    >
      {event.phase === "countdown" && (
        <CountdownScreen endsAt={event.countdownEndsAt} />
      )}
      {event.phase === "reveal" && (
        // KEYED on the stage, which is what closes an open full-screen photo on every
        // client when the host moves on — without the event state ever carrying who is
        // looking at what.
        <RevealScreen
          key={`${String(event.podiumRank)}-${String(event.podiumNextAt)}`}
          event={event}
          onHostNext={onHostNext}
        />
      )}
      {event.phase === "wheel" && <WheelScreen event={event} onDone={onDone} />}
      <p className="gb-event-day">DAY {event.day}</p>
    </div>
  );
}
