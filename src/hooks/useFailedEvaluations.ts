import { useCallback, useEffect, useState } from "react";
import {
  evaluationRetrySchema,
  failedEvaluationsSchema,
  type EvaluationRetry,
} from "@shared/api";
import { apiFetch } from "@/lib/api";

export function useFailedEvaluations(
  isAdmin: boolean,
  day: number | undefined,
): { failed: number; retry: () => Promise<EvaluationRetry> } {
  const [failed, setFailed] = useState(0);
  // In the path rather than left to the server's default, so the retry acts on the day
  // the count was read for even if the clock moves on.
  const path = day === undefined ? null : `/api/admin/evaluate?day=${day}`;

  const refresh = useCallback(() => {
    if (!isAdmin || path === null) {
      setFailed(0);
      return;
    }
    apiFetch(path, failedEvaluationsSchema)
      .then((result) => {
        setFailed(result.failed);
      })
      .catch(() => {
        setFailed(0);
      });
  }, [isAdmin, path]);

  useEffect(refresh, [refresh]);

  const retry = useCallback(async () => {
    if (path === null) throw new Error("The clock has not answered yet");
    const result = await apiFetch(path, evaluationRetrySchema, {
      method: "POST",
    });
    refresh();
    return result;
  }, [path, refresh]);

  return { failed, retry };
}
