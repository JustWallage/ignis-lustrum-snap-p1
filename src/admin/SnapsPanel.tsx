import { useState } from "react";
import {
  dayPhotosSchema,
  photoDescriptionSchema,
  retirementSchema,
  type PhotoDescription,
} from "@shared/api";
import type { GameState } from "@shared/state";
import { ConfirmButton } from "@/admin/ConfirmButton";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { readApiError } from "@/lib/api";

const REFUSED = "Nothing was retired.";

const DESCRIBE_REFUSED = "Nothing was described.";

function retiredText(retired: number, day: number): string {
  return `${String(retired)} snap${retired === 1 ? "" : "s"} retired out of day ${String(day)}. The pictures are still in the bucket.`;
}

function describedText(status: PhotoDescription["status"] | undefined): string {
  if (status === undefined) return "Not described";
  return status === "ok" ? "Described" : "Description failed";
}

export function SnapsPanel({
  clock,
  onRetired,
}: {
  clock: GameState | undefined;
  onRetired: () => void;
}) {
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  // Empty means "the day the world is on", which is why the field is a string and not
  // the day itself: a cleared box has to stay cleared long enough to type another one.
  const asked = Number(picked);
  const shown =
    picked.trim() !== "" && Number.isInteger(asked) && asked > 0
      ? asked
      : (clock?.day ?? 1);
  const list = useCachedFetch(
    `/api/admin/days/${String(shown)}/photos`,
    dayPhotosSchema,
  );
  const { mutate } = list;

  const press = async (path: string, refused: string): Promise<unknown> => {
    setBusy(true);
    setNote(null);
    setRefusal(null);
    try {
      const res = await fetch(path, { method: "POST" });
      if (res.ok) return await res.json();
      setRefusal(await readApiError(res, refused));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const retire = async (path: string) => {
    const body = await press(path, REFUSED);
    if (body === null) return;
    const done = retirementSchema.parse(body);
    setNote(retiredText(done.retired, done.day));
    mutate();
    onRetired();
  };

  const describe = async (id: number) => {
    const body = await press(
      `/api/admin/photos/${String(id)}/describe`,
      DESCRIBE_REFUSED,
    );
    if (body === null) return;
    const done = photoDescriptionSchema.parse(body);
    setNote(`Snap #${String(done.photoId)} — ${describedText(done.status)}.`);
    mutate();
  };

  const photos = list.data?.photos ?? [];
  const described = new Map(
    (list.data?.descriptions ?? []).map((row) => [row.photoId, row.status]),
  );

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
            value={picked}
            placeholder={String(clock?.day ?? 1)}
            onChange={(event) => {
              setPicked(event.target.value);
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
                <span data-testid={`ops-described-${String(photo.id)}`}>
                  {describedText(described.get(photo.id))}
                </span>
              </p>
              <button
                type="button"
                className="ops-btn"
                data-testid={`ops-describe-${String(photo.id)}`}
                aria-busy={busy}
                disabled={busy}
                onClick={() => {
                  void describe(photo.id);
                }}
              >
                Describe
              </button>
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
