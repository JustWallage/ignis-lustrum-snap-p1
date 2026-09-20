import { useState, type SyntheticEvent } from "react";
import { MESSAGE_MAX_CHARS } from "@shared/presence";
import { GbTextbox } from "@/components/GbTextbox";

/** The ONE in-screen text field: the town's speech, the neighbour's free-text reply and a
 * photographer's caption all type into this, so what the shell does with a keystroke is
 * decided once. */
export function SayBox({
  onSay,
  onClose,
  maxLength = MESSAGE_MAX_CHARS,
  initial = "",
  label = "Say something",
  action = "Say",
}: {
  onSay: (text: string) => void;
  onClose: () => void;
  maxLength?: number;
  initial?: string;
  label?: string;
  action?: string;
}) {
  const [text, setText] = useState(initial);

  const send = (event: SyntheticEvent) => {
    event.preventDefault();
    const said = text.trim();
    // Empty is a no-op for a box that opened empty and a CLEAR for one that did not:
    // speech nobody typed is not worth a frame, and a caption thought better of has to
    // come off with the same button that put it on.
    if (said !== "" || initial !== "") onSay(said);
    onClose();
  };

  return (
    <GbTextbox>
      <form
        className="gb-say"
        onSubmit={send}
        // Without this the shell's own key handling would see every keystroke.
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <label className="sr-only" htmlFor="say-text">
          {label}
        </label>
        <input
          id="say-text"
          data-testid="say-input"
          className="gb-say-input"
          value={text}
          maxLength={maxLength}
          autoComplete="off"
          autoFocus
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <button type="submit" className="gb-say-send" data-testid="say-send">
          {action}
        </button>
      </form>
    </GbTextbox>
  );
}
