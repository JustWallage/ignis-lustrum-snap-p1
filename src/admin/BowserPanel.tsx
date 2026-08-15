import { useCallback, useState } from "react";
import { bowserDaysSchema } from "@shared/api";
import { ConfirmButton } from "@/admin/ConfirmButton";
import { useCachedFetch } from "@/hooks/useCachedFetch";

const PATH = "/api/admin/bowser";

export function BowserPanel() {
  const list = useCachedFetch(PATH, bowserDaysSchema);
  const { mutate } = list;
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);

  const write = useCallback(
    async (init: RequestInit, path = PATH) => {
      setBusy(true);
      try {
        await fetch(path, init);
        mutate();
      } finally {
        setBusy(false);
      }
    },
    [mutate],
  );

  const asked = Number(day);
  const legal = day.trim() !== "" && Number.isInteger(asked) && asked > 0;
  const days = list.data?.days ?? [];

  return (
    <section className="ops-panel" data-testid="ops-bowser">
      <h2 className="ops-heading">Bowser days</h2>
      <p className="ops-note">
        A marked day plays exactly as every other day until the winner has been
        announced. Nothing before that says it is coming. A day is an integer
        with no relation to the wall clock, so winding the clock back over a
        marked day replays it as a Bowser day.
      </p>
      <ul className="ops-list">
        {days.map((marked) => (
          <li className="ops-line" key={marked.day}>
            <span className="ops-grow">
              {`Day ${String(marked.day)} — marked by ${marked.markedBy.name}`}
            </span>
            <ConfirmButton
              label="Unmark"
              question={`Unmark day ${String(marked.day)}?`}
              confirm="Unmark it"
              testId={`ops-bowser-unmark-${String(marked.day)}`}
              busy={busy}
              onConfirm={() => {
                void write(
                  { method: "DELETE" },
                  `${PATH}/${String(marked.day)}`,
                );
              }}
            />
          </li>
        ))}
      </ul>
      {days.length === 0 && (
        <p className="ops-empty" data-testid="ops-bowser-empty">
          {list.loading ? "Reading the days…" : "No Bowser days."}
        </p>
      )}
      <div className="ops-row">
        <label className="ops-field">
          Day
          <input
            className="ops-input"
            type="number"
            min={1}
            step={1}
            data-testid="ops-bowser-day"
            value={day}
            onChange={(event) => {
              setDay(event.target.value);
            }}
          />
        </label>
        <button
          type="button"
          className="ops-btn"
          data-testid="ops-bowser-mark"
          aria-busy={busy}
          disabled={busy || !legal}
          onClick={() => {
            void write({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ day: asked }),
            });
          }}
        >
          Mark it
        </button>
      </div>
    </section>
  );
}
