import { useState } from "react";
import {
  evaluationRetrySchema,
  failedEvaluationsSchema,
  type EvaluationRetry,
} from "@shared/api";
import type { GameState } from "@shared/state";
import { useCachedFetch } from "@/hooks/useCachedFetch";

function retriedText(result: EvaluationRetry): string {
  if (result.attempted === 0) return "Nothing was waiting for the jury.";
  if (result.failed === 0) {
    return `${String(result.ok)} of ${String(result.attempted)} scored.`;
  }
  return `${String(result.ok)} of ${String(result.attempted)} scored — the jury broke it a second time on ${String(result.failed)}.`;
}

export function RetryPanel({ clock }: { clock: GameState | undefined }) {
  // In the path rather than left to the server's default, so the retry acts on the day
  // the count was read for even if the clock moves on.
  const day = clock?.day ?? 1;
  const path = `/api/admin/evaluate?day=${String(day)}`;
  const counted = useCachedFetch(path, failedEvaluationsSchema);
  const { mutate } = counted;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(path, { method: "POST" });
      setNote(
        res.ok
          ? retriedText(evaluationRetrySchema.parse(await res.json()))
          : "The retry broke too. Give it a moment and try again.",
      );
      mutate();
    } finally {
      setBusy(false);
    }
  };

  const failed = counted.data?.failed ?? 0;

  return (
    <section className="ops-panel" data-testid="ops-retry">
      <h2 className="ops-heading">Jury retries</h2>
      <p className="ops-note">
        A verdict the jury choked on, on day {day}. A snap whose picture has
        gone is skipped rather than scored empty.
      </p>
      <div className="ops-row">
        <p className="ops-readout" data-testid="ops-retry-count">
          {`${String(failed)} broken`}
        </p>
        <button
          type="button"
          className="ops-btn"
          data-testid="ops-retry-run"
          aria-busy={busy}
          disabled={busy || failed === 0}
          onClick={() => {
            void run();
          }}
        >
          Send them back
        </button>
      </div>
      {note !== null && (
        <p className="ops-note" data-testid="ops-retry-note">
          {note}
        </p>
      )}
    </section>
  );
}
