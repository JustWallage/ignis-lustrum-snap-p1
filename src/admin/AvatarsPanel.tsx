import { useState } from "react";
import { avatarCapsSchema, avatarCountsSchema } from "@shared/api";
import type { GameState } from "@shared/state";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { readApiError } from "@/lib/api";

/** An EMPTY field is refused rather than read as 0: `Number("")` is 0, and a cleared
 * box saving as "closed for the day" is the one mistake this panel can make with
 * money. */
function askedCaps(limit: string, townLimit: string) {
  return avatarCapsSchema.safeParse({
    limit: limit.trim() === "" ? null : Number(limit),
    townLimit: townLimit.trim() === "" ? null : Number(townLimit),
  });
}

export function AvatarsPanel({ clock }: { clock: GameState | undefined }) {
  // The day is in the PATH rather than left to the server's default, so a landing
  // between the press and the answer cannot change which day is reported.
  const day = clock?.day ?? 1;
  const counts = useCachedFetch(
    `/api/admin/avatars?day=${String(day)}`,
    avatarCountsSchema,
  );
  const { data, mutate } = counts;
  const [committed, setCommitted] = useState<string | null>(null);
  const [limit, setLimit] = useState("");
  const [townLimit, setTownLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // What is in force arrives (and comes back after every save) as new numbers; adopted
  // during render rather than in an effect, so the fields never paint stale.
  const inForce =
    data === undefined
      ? null
      : `${String(data.limit)}/${String(data.townLimit)}`;
  if (inForce !== null && data !== undefined && committed !== inForce) {
    setCommitted(inForce);
    setLimit(String(data.limit));
    setTownLimit(String(data.townLimit));
  }

  const asked = askedCaps(limit, townLimit);
  const save = async () => {
    if (!asked.success) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/avatars", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(asked.data),
      });
      // A refused save leaves the fields showing what was typed, and the refetch
      // cannot correct them because the stored pair has not moved — so the refusal is
      // READ, or this panel sits there disagreeing with what the machine is on.
      setRefusal(
        res.ok ? null : await readApiError(res, "The caps would not save."),
      );
      if (res.ok) mutate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ops-panel" data-testid="ops-avatars">
      <h2 className="ops-heading">The avatar machine</h2>
      <form
        className="ops-row"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="ops-field">
          Per player, per day
          <input
            className="ops-input"
            type="number"
            min={0}
            step={1}
            data-testid="ops-cap-daily"
            value={limit}
            onChange={(event) => {
              setLimit(event.target.value);
            }}
          />
        </label>
        <label className="ops-field">
          Whole town, per day
          <input
            className="ops-input"
            type="number"
            min={0}
            step={1}
            data-testid="ops-cap-town"
            value={townLimit}
            onChange={(event) => {
              setTownLimit(event.target.value);
            }}
          />
        </label>
        <button
          type="submit"
          className="ops-btn"
          data-testid="ops-caps-save"
          aria-busy={busy}
          disabled={busy || !asked.success}
        >
          Save caps
        </button>
      </form>
      <p className="ops-note">
        0 closes the machine for the day. A player is told no at the choice,
        before a picker opens.
      </p>
      {refusal !== null && (
        <p className="ops-error" role="alert" data-testid="ops-caps-error">
          {refusal}
        </p>
      )}
      <dl className="ops-figures">
        <dt>Drawn on day {day}</dt>
        <dd data-testid="ops-avatar-day-total">{data?.dayTotal ?? "—"}</dd>
        <dt>Drawn all time</dt>
        <dd data-testid="ops-avatar-all-time">{data?.allTime ?? "—"}</dd>
        <dt>Estimated spend</dt>
        <dd data-testid="ops-avatar-estimate">
          {data === undefined
            ? "—"
            : `~${data.estimate.amount.toFixed(2)} ${data.estimate.currency}`}
        </dd>
      </dl>
      <p className="ops-note">
        An ESTIMATE: Google reports no bill, so this is the sprites we counted ×
        what one costs. It counts sprites that were kept, not calls Google may
        have charged for.
      </p>
      <ul className="ops-list" data-testid="ops-avatar-roster">
        {(data?.players ?? []).map((row) => (
          <li className="ops-line" key={row.user.id}>
            <span className="ops-grow">{row.user.name.toUpperCase()}</span>
            <span>{row.used}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
