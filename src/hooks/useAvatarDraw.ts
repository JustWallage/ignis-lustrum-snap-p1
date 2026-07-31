import { useCallback, type RefObject } from "react";
import { avatarStateSchema, type AvatarState } from "@shared/api";
import { useFilePicker } from "@/hooks/useFilePicker";
import { readApiError } from "@/lib/api";
import { compressedPhotoForm } from "@/lib/image";

const UNREADABLE = "The machine could not make sense of that one. Try another.";

const DRAW_FAILED = "The machine drew nothing that time. Have another go.";

export function useAvatarDraw({
  onDrawing,
  onDrawn,
  onFailed,
}: {
  onDrawing: () => void;
  onDrawn: (state: AvatarState) => void;
  onFailed: (message: string) => void;
}): {
  inputRef: RefObject<HTMLInputElement | null>;
  open: () => void;
  picked: () => void;
} {
  const draw = useCallback(
    (file: File) => {
      onDrawing();
      void (async () => {
        let body: FormData;
        try {
          body = await compressedPhotoForm(file, "source.jpg");
        } catch {
          onFailed(UNREADABLE);
          return;
        }
        try {
          const res = await fetch("/api/avatar", { method: "POST", body });
          if (!res.ok) {
            onFailed(await readApiError(res, DRAW_FAILED));
            return;
          }
          onDrawn(avatarStateSchema.parse(await res.json()));
        } catch {
          onFailed(DRAW_FAILED);
        }
      })();
    },
    [onDrawing, onDrawn, onFailed],
  );

  return useFilePicker(draw);
}
