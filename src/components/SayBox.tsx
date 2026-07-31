import { useState, type SyntheticEvent } from "react";
import { MESSAGE_MAX_CHARS } from "@shared/presence";
import { GbTextbox } from "@/components/GbTextbox";

export function SayBox({
  onSay,
  onClose,
  maxLength = MESSAGE_MAX_CHARS,
}: {
  onSay: (text: string) => void;
  onClose: () => void;
  maxLength?: number;
}) {
  const [text, setText] = useState("");

  const send = (event: SyntheticEvent) => {
    event.preventDefault();
    const said = text.trim();
    if (said !== "") onSay(said);
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
          Say something
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
          Say
        </button>
      </form>
    </GbTextbox>
  );
}
