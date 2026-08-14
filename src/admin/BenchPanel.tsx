import { useCallback, useState } from "react";
import { juryBenchSchema, type JuryBenchVerdict } from "@shared/api";
import { JURIES } from "@shared/juries";
import { useFilePicker } from "@/hooks/useFilePicker";
import { readApiError } from "@/lib/api";
import { compressedPhotoForm, IMAGE_ACCEPT } from "@/lib/image";
import { ratingText } from "@/lib/rating";

const UNREADABLE = "The bench could not make sense of that file. Pick a photo.";

const BENCH_FAILED = "The bench would not answer. Try that again.";

export function BenchPanel() {
  const [chosen, setChosen] = useState(0);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<JuryBenchVerdict | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const tryOut = useCallback(
    (file: File) => {
      setBusy(true);
      setNote(null);
      setVerdict(null);
      void (async () => {
        let body: FormData;
        try {
          body = await compressedPhotoForm(file, "bench.jpg");
          // The INDEX, so the persona the worker judges with is the worker's own
          // copy of it and nothing here can write a jury.
          body.append("jury", String(chosen));
        } catch {
          setNote(UNREADABLE);
          setBusy(false);
          return;
        }
        try {
          const res = await fetch("/api/admin/bench", { method: "POST", body });
          if (res.ok) {
            setVerdict(juryBenchSchema.parse(await res.json()));
          } else {
            setNote(await readApiError(res, BENCH_FAILED));
          }
        } catch {
          setNote(BENCH_FAILED);
        } finally {
          setBusy(false);
        }
      })();
    },
    [chosen],
  );

  const { inputRef, open, picked } = useFilePicker(tryOut);
  const jury = JURIES[chosen] ?? JURIES[0];

  return (
    <section className="ops-panel" data-testid="ops-bench">
      <h2 className="ops-heading">The jury bench</h2>
      <p className="ops-note">
        Pick a jury, hand it any photo, read what it would have said. Nothing is
        stored and no day moves.
      </p>
      <ul className="ops-list">
        {JURIES.map((entry, index) => (
          <li key={entry.name}>
            <button
              type="button"
              className="ops-tab"
              aria-pressed={index === chosen}
              onClick={() => {
                setChosen(index);
              }}
            >
              {`${entry.name} — ${entry.theme}`}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="ops-btn"
        data-testid="ops-bench-try"
        aria-busy={busy}
        disabled={busy}
        onClick={open}
      >
        {`Try ${jury.name}`}
      </button>
      {note !== null && (
        <p className="ops-error" role="alert" data-testid="ops-bench-note">
          {note}
        </p>
      )}
      {verdict !== null && (
        <dl className="ops-figures" data-testid="ops-bench-verdict">
          <dt>{verdict.jury}</dt>
          <dd>{`${verdict.theme} · ${ratingText(verdict.score)}`}</dd>
          <dt>Caption</dt>
          <dd>{verdict.caption}</dd>
          <dt>Critique</dt>
          <dd>{verdict.critique}</dd>
          <dt>Bonus</dt>
          <dd>
            {verdict.bonusDetected ? "Spotted it" : "Not spotted"}
            {verdict.bonusReason === "" ? "" : ` — ${verdict.bonusReason}`}
          </dd>
        </dl>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="ops-hidden"
        onChange={picked}
      />
    </section>
  );
}
