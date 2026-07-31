import { useState, type SyntheticEvent } from "react";
import { GbWindow } from "@/components/GbWindow";
import { useAuth } from "@/context/AuthContext";

export function LoginDialog({
  note,
  onClose,
}: {
  note?: string;
  onClose: () => void;
}) {
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(name.trim(), password);
      onClose();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GbWindow title="Sign in" onClose={onClose}>
      {note !== undefined && <p className="mb-3 text-xs">{note}</p>}
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="space-y-3"
      >
        {error !== "" && (
          <p className="gb-error" role="alert">
            {error}
          </p>
        )}
        <label className="block text-xs font-bold uppercase" htmlFor="name">
          Name
          <input
            id="name"
            className="gb-input mt-1"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-xs font-bold uppercase" htmlFor="password">
          Password
          <input
            id="password"
            type="password"
            className="gb-input mt-1"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" className="gb-btn w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </GbWindow>
  );
}
