import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { busyProps, placeholderFor } from "@/lib/pending";

const PIXELS = [0, 1, 2];

/** With a `label` it is a live region; WITHOUT one it is decoration, for a control that
 * already carries `aria-busy` and would otherwise be announced twice. */
export function GbPending({ label }: { label?: string }) {
  const announced: ComponentPropsWithoutRef<"span"> =
    label === undefined
      ? { "aria-hidden": true }
      : { role: "status", "aria-busy": true, "aria-label": label };
  return (
    <span className="gb-pending" data-testid="pending" {...announced}>
      {PIXELS.map((pixel) => (
        <i key={pixel} />
      ))}
    </span>
  );
}

export function GbButton({
  busy = false,
  disabled = false,
  type = "button",
  className = "gb-btn",
  children,
  ...rest
}: Omit<ComponentPropsWithoutRef<"button">, "aria-busy"> & {
  busy?: boolean;
}) {
  return (
    <button
      {...rest}
      type={type}
      className={className}
      {...busyProps(busy, disabled)}
    >
      {children}
      {busy && <GbPending />}
    </button>
  );
}

export function GbPlaceholder({
  error,
  loading,
  testId,
  children,
}: {
  error: string | null;
  loading: boolean;
  testId?: string;
  children?: ReactNode;
}) {
  const state = placeholderFor(error, loading);
  return (
    <p className="text-xs" data-testid={testId}>
      {state.kind === "error" ? (
        state.text
      ) : state.kind === "pending" ? (
        <GbPending label="Loading" />
      ) : (
        children
      )}
    </p>
  );
}
