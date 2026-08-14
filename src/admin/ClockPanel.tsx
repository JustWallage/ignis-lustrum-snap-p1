import { useState } from "react";
import { clockSchema } from "@shared/api";
import type { GameState } from "@shared/state";
import { ConfirmButton } from "@/admin/ConfirmButton";
import { readApiError } from "@/lib/api";

const REFUSED = "The clock would not move.";

function movedText(day: number, awardsDropped: number): string {
  const awards =
    awardsDropped === 0
      ? "no awards dropped"
      : `${String(awardsDropped)} award${awardsDropped === 1 ? "" : "s"} dropped`;
  return `Day ${String(day)} — ${awards}.`;
}

export function ClockPanel({
  clock,
  onMoved,
}: {
  clock: GameState | undefined;
  onMoved: () => void;
}) {
  const [day, setDay] = useState("");
  const [committed, setCommitted] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  if (clock !== undefined && committed !== clock.day) {
    setCommitted(clock.day);
    setDay(String(clock.day));
  }

  const asked = Number(day);
  const legal = day.trim() !== "" && Number.isInteger(asked) && asked > 0;

  const set = async () => {
    setBusy(true);
    setNote(null);
    setRefusal(null);
    try {
      const res = await fetch("/api/admin/day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: asked }),
      });
      if (res.ok) {
        const moved = clockSchema.parse(await res.json());
        setNote(movedText(moved.day, moved.awardsDropped));
        onMoved();
      } else {
        setRefusal(await readApiError(res, REFUSED));
      }
    } finally {
      setBusy(false);
    }
  };

  const direction =
    clock === undefined || asked === clock.day
      ? "Set"
      : asked > clock.day
        ? "Wind forward"
        : "Wind back";

  return (
    <section className="ops-panel" data-testid="ops-clock-panel">
      <h2 className="ops-heading">The clock</h2>
      <p className="ops-note">
        A day is an integer with no relation to the wall clock. Winding back
        over a landed wheel drops that day&apos;s prize award, and the replayed
        landing awards it again.
      </p>
      <div className="ops-row">
        <label className="ops-field">
          Day
          <input
            className="ops-input"
            type="number"
            min={1}
            step={1}
            data-testid="ops-day-input"
            value={day}
            onChange={(event) => {
              setDay(event.target.value);
            }}
          />
        </label>
        <ConfirmButton
          label={`${direction} the clock`}
          question={`${direction} to day ${day}?`}
          confirm="Move it"
          testId="ops-day-set"
          busy={busy}
          disabled={!legal}
          onConfirm={() => {
            void set();
          }}
        />
      </div>
      {note !== null && (
        <p className="ops-note" data-testid="ops-clock-note">
          {note}
        </p>
      )}
      {refusal !== null && (
        <p className="ops-error" role="alert" data-testid="ops-clock-error">
          {refusal}
        </p>
      )}
    </section>
  );
}
