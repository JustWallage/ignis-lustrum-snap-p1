import { useCallback, useState, type SyntheticEvent } from "react";
import { CAPTION_MAX } from "@shared/api";
import { GbButton } from "@/components/GbPending";
import { readApiError } from "@/lib/api";

const REFUSED = "That caption would not stick. Have another go in a moment.";

const HINT = "A line under your snap. Your words, never your name.";

/**
 * The caption on a surface that is NOT the LCD's dialogue box, which is where `SayBox`
 * lives and cannot follow: this one sits inside a `GbWindow` the modal layer paints
 * over the shell. It is the same field and the same route either way — the jury's
 * conversation is the D-pad path to it and this is the one you land on straight after
 * uploading, which is the moment a photographer actually has something to say.
 */
export function CaptionField({
  id,
  caption,
  onSaved,
}: {
  id: number;
  caption: string | null;
  onSaved: () => void;
}) {
  const [text, setText] = useState(caption ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = useCallback(
    async (event: SyntheticEvent) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        const res = await fetch(`/api/photos/${String(id)}/caption`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caption: text.trim() }),
        });
        if (!res.ok) {
          setError(await readApiError(res, REFUSED));
          return;
        }
        onSaved();
      } finally {
        setBusy(false);
      }
    },
    [busy, id, onSaved, text],
  );

  return (
    <form
      className="space-y-1"
      data-testid="caption-field"
      onSubmit={(event) => {
        void save(event);
      }}
    >
      <label className="block text-xs" htmlFor="snap-caption">
        {HINT}
      </label>
      <div className="flex gap-2">
        <input
          id="snap-caption"
          data-testid="caption-input"
          className="gb-input flex-1"
          value={text}
          maxLength={CAPTION_MAX}
          autoComplete="off"
          placeholder="Say where you took it…"
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <GbButton
          type="submit"
          className="gb-btn px-3"
          data-testid="caption-save"
          busy={busy}
        >
          Save
        </GbButton>
      </div>
      {error !== "" && (
        <p className="gb-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
