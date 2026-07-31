export interface BusyProps {
  disabled: boolean;
  "aria-busy": boolean;
}

/** Busy IS disabled — one decision, because a control that showed it was working and
 * stayed clickable is what let two taps of Send post the same comment twice. */
export function busyProps(busy: boolean, disabled = false): BusyProps {
  return { disabled: busy || disabled, "aria-busy": busy };
}

export type Placeholder =
  { kind: "error"; text: string } | { kind: "pending" } | { kind: "empty" };

/** A refusal beats a wait beats nothing-here-yet. The ORDER matters: replacing an error
 * that landed during a refetch with a spinner makes a failure look like a slow one. */
export function placeholderFor(
  error: string | null,
  loading: boolean,
): Placeholder {
  if (error !== null) return { kind: "error", text: error };
  return loading ? { kind: "pending" } : { kind: "empty" };
}
