import { useState } from "react";
import {
  prizeListSchema,
  prizesPath,
  riggedDaysSchema,
  type Prize,
  type PrizeSet,
} from "@shared/api";
import { ConfirmButton } from "@/admin/ConfirmButton";
import { useOpsWrite } from "@/admin/useOpsWrite";
import { useCachedFetch } from "@/hooks/useCachedFetch";

const PATH = "/api/admin/rig";

const SET_LABELS: Record<PrizeSet, string> = {
  ordinary: "Ordinary",
  bowser: "Bowser",
};

function choices(set: PrizeSet, prizes: Prize[]) {
  return prizes.map((prize) => ({
    value: `${set}:${String(prize.id)}`,
    id: prize.id,
    label: `${SET_LABELS[set]} — ${prize.label}${prize.enabled ? "" : " (off)"}`,
  }));
}

export function RigPanel() {
  const list = useCachedFetch(PATH, riggedDaysSchema);
  const ordinary = useCachedFetch(prizesPath("ordinary"), prizeListSchema);
  const bowser = useCachedFetch(prizesPath("bowser"), prizeListSchema);
  const { busy, write } = useOpsWrite(PATH, list.mutate);
  const [day, setDay] = useState("");
  const [picked, setPicked] = useState("");

  const asked = Number(day);
  const options = [
    ...choices("ordinary", ordinary.data?.prizes ?? []),
    ...choices("bowser", bowser.data?.prizes ?? []),
  ];
  const prizeId = options.find((one) => one.value === picked)?.id;
  const legal =
    day.trim() !== "" &&
    Number.isInteger(asked) &&
    asked > 0 &&
    prizeId !== undefined;
  const days = list.data?.days ?? [];

  return (
    <section className="ops-panel" data-testid="ops-rig">
      <h2 className="ops-heading">Rigged landings</h2>
      <p className="ops-note">
        The drum rolls exactly as it always does; only the segment it stops on
        is decided in advance. A rig names a PRIZE, not a position, so
        reordering or renaming it changes nothing. If the rigged prize is not
        among that night&rsquo;s segments — turned off, deleted, or in the set
        the day&rsquo;s Bowser mark no longer uses — the day lands at random
        instead. Nothing expires a rig, so winding the clock back over one
        replays it.
      </p>
      <ul className="ops-list">
        {days.map((rigged) => (
          <li className="ops-line" key={rigged.day}>
            <span className="ops-grow">
              {`Day ${String(rigged.day)} — ${SET_LABELS[rigged.prize.set]}: ${rigged.prize.label}, rigged by ${rigged.riggedBy.name}`}
            </span>
            <ConfirmButton
              label="Clear"
              question={`Clear the rig on day ${String(rigged.day)}?`}
              confirm="Clear it"
              testId={`ops-rig-clear-${String(rigged.day)}`}
              busy={busy}
              onConfirm={() => {
                void write(
                  { method: "DELETE" },
                  `${PATH}/${String(rigged.day)}`,
                );
              }}
            />
          </li>
        ))}
      </ul>
      {days.length === 0 && (
        <p className="ops-empty" data-testid="ops-rig-empty">
          {list.loading ? "Reading the rigs…" : "No rigged days."}
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
            data-testid="ops-rig-day"
            value={day}
            onChange={(event) => {
              setDay(event.target.value);
            }}
          />
        </label>
        <label className="ops-field ops-grow">
          Prize
          <select
            className="ops-input"
            data-testid="ops-rig-prize"
            value={picked}
            onChange={(event) => {
              setPicked(event.target.value);
            }}
          >
            <option value="">Pick a prize…</option>
            {options.map((one) => (
              <option key={one.value} value={one.value}>
                {one.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="ops-btn"
          data-testid="ops-rig-set"
          aria-busy={busy}
          disabled={busy || !legal}
          onClick={() => {
            void write({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ day: asked, prizeId }),
            });
          }}
        >
          Rig it
        </button>
      </div>
    </section>
  );
}
