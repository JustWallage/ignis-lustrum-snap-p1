import { useState } from "react";
import { dayPhotosSchema, retirementSchema } from "@shared/api";
import type { GameState } from "@shared/state";
import { ConfirmButton } from "@/admin/ConfirmButton";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { readApiError } from "@/lib/api";

const REFUSED = "Nothing was retired.";

function retiredText(retired: number, day: number): string {
  return `${String(retired)} snap${retired === 1 ? "" : "s"} retired out of day ${String(day)}. The pictures are still in the bucket.`;
}

export function SnapsPanel({
  clock,
  onRetired,
}: {
  clock: GameState | undefined;
  onRetired: () => void;
}) {
  const [day, setDay] = useState<number | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  if (clock !== undefined && committed !== clock.day) {
    setCommitted(clock.day);
    if (day === null) setDay(clock.day);
  }

  const shown = day ?? clock?.day ?? 1;
  const list = useCachedFetch(
    `/api/admin/days/${String(shown)}/photos`,
    dayPhotosSchema,
  );
  const { mutate } = list;

  const retire = async (path: string) => {
    setBusy(true);
    setNote(null);
    setRefusal(null);
    try {
      const res = await fetch(path, { method: "POST" });
      if (res.ok) {
        const done = retirementSchema.parse(await res.json());
        setNote(retiredText(done.retired, done.day));
        mutate();
        onRetired();
      } else {
        setRefusal(await readApiError(res, REFUSED));
      }
    } finally {
      setBusy(false);
    }
  };

  const photos = list.data?.photos ?? [];

  return (
    <section className="ops-panel" data-testid="ops-snaps-panel">
      <h2 className="ops-heading">The day&apos;s snaps</h2>
      <div className="ops-row">
        <label className="ops-field">
          Day
          <input
            className="ops-input"
            type="number"
            min={1}
            step={1}
            data-testid="ops-snap-day"
            value={String(shown)}
            onChange={(event) => {
              const asked = Number(event.target.value);
              if (Number.isInteger(asked) && asked > 0) setDay(asked);
            }}
          />
        </label>
        <ConfirmButton
          label="Retire the whole day"
          question={`Retire every snap on day ${String(shown)}?`}
          confirm="Retire them"
          testId="ops-retire-day"
          busy={busy}
          disabled={photos.length === 0}
          onConfirm={() => {
            void retire(`/api/admin/days/${String(shown)}/retire`);
          }}
        />
      </div>
      {note !== null && (
        <p className="ops-note" data-testid="ops-snaps-note">
          {note}
        </p>
      )}
      {refusal !== null && (
        <p className="ops-error" role="alert" data-testid="ops-snaps-error">
          {refusal}
        </p>
      )}
      {photos.length === 0 ? (
        <p className="ops-empty" data-testid="ops-snaps-empty">
          {list.loading
            ? "Reading the day…"
            : "Nothing was handed in that day."}
        </p>
      ) : (
        <ul className="ops-grid" data-testid="ops-snaps">
          {photos.map((photo) => (
            <li className="ops-card" key={photo.id} data-testid="ops-snap">
              <img className="ops-shot" src={photo.url} alt="" loading="lazy" />
              <p className="ops-card-meta">
                <span>#{photo.id}</span>
                {photo.uploader !== null && <span>{photo.uploader.name}</span>}
                {photo.aiScore !== null && (
                  <span>{`Jury ${String(photo.aiScore)}`}</span>
                )}
              </p>
              <ConfirmButton
                label="Retire"
                question={`Retire snap #${String(photo.id)}?`}
                confirm="Retire it"
                testId={`ops-retire-${String(photo.id)}`}
                busy={busy}
                onConfirm={() => {
                  void retire(`/api/admin/photos/${String(photo.id)}/retire`);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
