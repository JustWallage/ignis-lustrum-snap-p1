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
