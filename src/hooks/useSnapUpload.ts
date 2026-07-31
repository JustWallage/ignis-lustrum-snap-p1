import { useCallback, useRef, type RefObject } from "react";
import { photoSchema } from "@shared/api";
import { useFilePicker } from "@/hooks/useFilePicker";
import { readApiError } from "@/lib/api";
import { compressedPhotoForm } from "@/lib/image";

const UNREADABLE = "The jury could not make sense of that file. Pick a photo.";

const UPLOAD_FAILED = "That one would not go through. Try another.";

export function useSnapUpload({
  onSending,
  onSent,
  onFailed,
}: {
  onSending: () => void;
  onSent: (id: number) => void;
  onFailed: (message: string) => void;
}): {
  inputRef: RefObject<HTMLInputElement | null>;
  open: (replace: boolean) => void;
  picked: () => void;
} {
  const replaceRef = useRef(false);

  const send = useCallback(
    (file: File) => {
      const replace = replaceRef.current;
      onSending();
      void (async () => {
        let body: FormData;
        try {
          body = await compressedPhotoForm(file, "snap.jpg");
          if (replace) {
            body.append("replace", "1");
          }
        } catch {
          onFailed(UNREADABLE);
          return;
        }
        try {
          const res = await fetch("/api/photos", { method: "POST", body });
          if (!res.ok) {
            onFailed(await readApiError(res, UPLOAD_FAILED));
            return;
          }
          onSent(photoSchema.parse(await res.json()).id);
        } catch {
          onFailed(UPLOAD_FAILED);
        }
      })();
    },
    [onFailed, onSending, onSent],
  );

  const { inputRef, open: openPicker, picked } = useFilePicker(send);

  // Decided at the press and read back when the file arrives, so it rides a ref.
  const open = useCallback(
    (replace: boolean) => {
      replaceRef.current = replace;
      openPicker();
    },
    [openPicker],
  );

  return { inputRef, open, picked };
}
