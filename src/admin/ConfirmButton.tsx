import { useState } from "react";

export function ConfirmButton({
  label,
  question,
  confirm,
  testId,
  busy = false,
  disabled = false,
  onConfirm,
}: {
  label: string;
  question: string;
  confirm: string;
  testId?: string;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        className="ops-btn"
        disabled={disabled || busy}
        aria-busy={busy}
        {...(testId === undefined ? {} : { "data-testid": testId })}
        onClick={() => {
          setAsking(true);
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="ops-confirm" role="group" aria-label={question}>
      <span className="ops-confirm-text">{question}</span>
      {/* Cancel FIRST, as it is in the town's dialogue chains: the destructive
          answer is never the one a stray second tap lands on. */}
      <button
        type="button"
        className="ops-btn"
        onClick={() => {
          setAsking(false);
        }}
      >
        Cancel
      </button>
      <button
        type="button"
        className="ops-btn ops-btn-danger"
        {...(testId === undefined ? {} : { "data-testid": `${testId}-yes` })}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirm}
      </button>
    </span>
  );
}
