import { useCallback, useRef, type RefObject } from "react";

/**
 * ONE picker primitive, because its callers share two non-obvious constraints:
 *
 * - `open()` MUST be called inside the press itself. A `click()` deferred into a promise
 *   chain loses the user gesture, and Safari then refuses to open a picker.
 * - the input has to be a plain hidden `<input type="file">`, because Playwright cannot
 *   drive a `showOpenFilePicker`-style API.
 *
 * A cancelled picker fires no `change`, so nothing is invented for that outcome.
 */
export function useFilePicker(onPicked: (file: File) => void): {
  inputRef: RefObject<HTMLInputElement | null>;
  open: () => void;
  picked: () => void;
} {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const open = useCallback(() => {
    const input = inputRef.current;
    if (input === null) return;
    // Picking the same file twice is a real thing to want, and `change` does not fire
    // when the value is unchanged.
    input.value = "";
    input.click();
  }, []);

  const picked = useCallback(() => {
    const file = inputRef.current?.files?.[0];
    if (file !== undefined) onPicked(file);
  }, [onPicked]);

  return { inputRef, open, picked };
}
