import { useState } from "react";
import {
  avatarCapsSchema,
  avatarCountsSchema,
  type AvatarCaps,
} from "@shared/api";
import { GbButton, GbPlaceholder } from "@/components/GbPending";
import { GbWindow } from "@/components/GbWindow";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { readApiError } from "@/lib/api";

export function AvatarMachine({
  day,
  onClose,
}: {
  day: number;
  onClose: () => void;
}) {
  // The day is in the PATH rather than left to the server's default, so a wheel landing
  // between the press and the answer cannot change which day is reported.
  const counts = useCachedFetch(
    `/api/admin/avatars?day=${String(day)}`,
    avatarCountsSchema,
  );
  const { data, mutate } = counts;
  const [committed, setCommitted] = useState<AvatarCaps | null>(null);
  const [limit, setLimit] = useState("");
  const [townLimit, setTownLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // What is in force arrives (and comes back after every save) as new numbers; adopted
  // during render rather than in an effect, so the fields never paint stale.
  if (
    data !== undefined &&
    (committed?.limit !== data.limit || committed.townLimit !== data.townLimit)
  ) {
    setCommitted({ limit: data.limit, townLimit: data.townLimit });
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
      // A refused save leaves the fields showing what was typed, and the refetch cannot
      // correct them because the stored pair has not moved — so the refusal is READ, or
      // this screen would sit there disagreeing with what the machine is actually on.
      setRefusal(
        res.ok ? null : await readApiError(res, "The caps would not save."),
      );
      if (res.ok) mutate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <GbWindow title="Avatar counts" onClose={onClose}>
      <div className="space-y-3" data-testid="avatar-machine">
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <CapField
            label="Per player, per day"
            testId="avatar-cap-daily"
            value={limit}
            onChange={setLimit}
          />
          <CapField
            label="Whole town, per day"
            testId="avatar-cap-town"
            value={townLimit}
            onChange={setTownLimit}
          />
          <GbButton
            type="submit"
            className="gb-btn w-full"
            data-testid="avatar-caps-save"
            busy={busy}
            disabled={!asked.success}
          >
            Save caps
          </GbButton>
          <p className="text-xs">
            0 closes the machine for the day. A player is told no at the choice,
            before a picker opens.
          </p>
          {refusal !== null && (
            <p
              className="gb-error"
              role="alert"
              data-testid="avatar-caps-error"
            >
              {refusal}
            </p>
          )}
        </form>
        <dl className="grid grid-cols-2 gap-1 border-t-2 border-[#071821] pt-2 text-xs">
          <dt>Drawn on day {day}</dt>
          <dd data-testid="avatar-day-total">{data?.dayTotal ?? "—"}</dd>
          <dt>Drawn all time</dt>
          <dd data-testid="avatar-all-time">{data?.allTime ?? "—"}</dd>
          <dt>Estimated spend</dt>
          <dd data-testid="avatar-estimate">
            {data === undefined
              ? "—"
              : `~${data.estimate.amount.toFixed(2)} ${data.estimate.currency}`}
          </dd>
        </dl>
        <p className="text-xs">
          An ESTIMATE: Google reports no bill, so this is the sprites we counted
          × what one costs. It counts sprites that were kept, not calls Google
          may have charged for.
        </p>
        <ul
          className="max-h-40 space-y-1 overflow-y-auto border-t-2 border-[#071821] pt-2 text-xs"
          data-testid="avatar-roster"
        >
          {(data?.players ?? []).map((row) => (
            <li key={row.user.id} className="flex justify-between gap-2">
              <span>{row.user.name.toUpperCase()}</span>
              <span>{row.used}</span>
            </li>
          ))}
        </ul>
        {data === undefined && (
          <GbPlaceholder error={counts.error} loading={counts.loading} />
        )}
      </div>
    </GbWindow>
  );
}

/** An EMPTY field is refused rather than read as 0: `Number("")` is 0, and a cleared box
 * saving as "closed for the day" is the one mistake this screen can make with money. */
function askedCaps(limit: string, townLimit: string) {
  return avatarCapsSchema.safeParse({
    limit: limit.trim() === "" ? null : Number(limit),
    townLimit: townLimit.trim() === "" ? null : Number(townLimit),
  });
}

function CapField({
  label,
  testId,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      {label}
      <input
        className="gb-input w-20 text-xs"
        type="number"
        min={0}
        step={1}
        data-testid={testId}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
  );
}
