import { useCallback, useState } from "react";
import { juryBenchSchema, type JuryBenchVerdict } from "@shared/api";
import { JURIES } from "@shared/juries";
import { GbButton } from "@/components/GbPending";
import { GbWindow } from "@/components/GbWindow";
import { useFilePicker } from "@/hooks/useFilePicker";
import { readApiError } from "@/lib/api";
import { compressedPhotoForm, IMAGE_ACCEPT } from "@/lib/image";
import { ratingText } from "@/lib/rating";

const UNREADABLE = "The bench could not make sense of that file. Pick a photo.";

const BENCH_FAILED = "The bench would not answer. Try that again.";

export function JuryBench({ onClose }: { onClose: () => void }) {
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
          const res = await fetch("/api/admin/bench", {
            method: "POST",
            body,
          });
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
    <GbWindow title="Jury bench" onClose={onClose}>
      <div className="space-y-3" data-testid="jury-bench">
        <p className="text-xs">
          Pick a jury, hand it any photo, read what it would have said. Nothing
          is stored and no day moves.
        </p>
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {JURIES.map((entry, index) => (
            <li key={entry.name}>
              <button
                type="button"
                className={`gb-btn w-full px-2 py-0.5 text-left text-xs ${
                  index === chosen ? "" : "opacity-60"
                }`}
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
        <GbButton
          className="gb-btn w-full px-3"
          busy={busy}
          data-testid="bench-try"
          onClick={open}
        >
          {`Try ${jury.name}`}
        </GbButton>
        {note !== null && (
          <p className="gb-error" role="alert" data-testid="bench-note">
            {note}
          </p>
        )}
        {verdict !== null && (
          <dl
            className="space-y-1 border-t-2 border-[#071821] pt-2 text-xs"
            data-testid="bench-verdict"
          >
            <div>
              <dt className="font-bold uppercase">{verdict.jury}</dt>
              <dd>{`${verdict.theme} · ${ratingText(verdict.score)}`}</dd>
            </div>
            <div>
              <dt className="font-bold uppercase">Caption</dt>
              <dd>{verdict.caption}</dd>
            </div>
            <div>
              <dt className="font-bold uppercase">Critique</dt>
              <dd>{verdict.critique}</dd>
            </div>
            <div>
              <dt className="font-bold uppercase">Bonus</dt>
              <dd>
                {verdict.bonusDetected ? "Spotted it" : "Not spotted"}
                {verdict.bonusReason === "" ? "" : ` — ${verdict.bonusReason}`}
              </dd>
            </div>
          </dl>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={picked}
        />
      </div>
    </GbWindow>
  );
}
