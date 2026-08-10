import { useCallback, useEffect, useState } from "react";
import { mySubmissionSchema, type MySubmission } from "@shared/api";
import { apiFetch } from "@/lib/api";

export function useMySubmission(
  userId: number | null,
  day: number | undefined,
): { mine: MySubmission | null; refresh: () => Promise<void> } {
  const [mine, setMine] = useState<MySubmission | null>(null);

  // Awaitable so a caller that is about to hand the screen back can wait for the answer:
  // the jury's conversation is built off `mine`, and reopening it on the previous one
  // offers "See my snap" for a snap that has just been torn up.
  const refresh = useCallback(async (): Promise<void> => {
    if (userId === null || day === undefined) {
      setMine(null);
      return;
    }
    try {
      setMine(
        await apiFetch(
          `/api/photos/mine?day=${String(day)}`,
          mySubmissionSchema,
        ),
      );
    } catch {
      setMine(null);
    }
  }, [day, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { mine, refresh };
}
