import { useCallback, useEffect, useState } from "react";
import { mySubmissionSchema, type MySubmission } from "@shared/api";
import { apiFetch } from "@/lib/api";

export function useMySubmission(
  userId: number | null,
  day: number | undefined,
): { mine: MySubmission | null; refresh: () => void } {
  const [mine, setMine] = useState<MySubmission | null>(null);

  const refresh = useCallback(() => {
    if (userId === null || day === undefined) {
      setMine(null);
      return;
    }
    apiFetch(`/api/photos/mine?day=${String(day)}`, mySubmissionSchema)
      .then(setMine)
      .catch(() => {
        setMine(null);
      });
  }, [day, userId]);

  useEffect(refresh, [refresh]);

  return { mine, refresh };
}
