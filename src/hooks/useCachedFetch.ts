import { useCallback, useEffect, useState } from "react";
import type { ZodType } from "zod";
import { apiFetch } from "@/lib/api";

const cache = new Map<string, unknown>();

export interface CachedFetch<T> {
  data: T | undefined;
  /** The FIRST fetch only, and never true again: show a placeholder. */
  loading: boolean;
  /** ANY fetch, the first included — which is what makes a post-mutation `mutate()` and
   * a realtime revalidation visible at all. */
  busy: boolean;
  error: string | null;
  mutate: () => void;
}

export function useCachedFetch<T>(
  path: string,
  schema: ZodType<T>,
): CachedFetch<T> {
  const [data, setData] = useState<T | undefined>(() => {
    const cached = cache.get(path);
    return cached === undefined ? undefined : schema.parse(cached);
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(data === undefined);
  // COUNTED rather than a flag: a mutation's refetch and a realtime revalidation
  // overlap constantly, and the second to land must not clear the first's indicator.
  const [inFlight, setInFlight] = useState(0);

  const mutate = useCallback(() => {
    setInFlight((count) => count + 1);
    apiFetch(path, schema)
      .then((fresh) => {
        cache.set(path, fresh);
        setData(fresh);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Request failed");
      })
      .finally(() => {
        setLoading(false);
        setInFlight((count) => count - 1);
      });
  }, [path, schema]);

  useEffect(() => {
    mutate();
  }, [mutate]);

  return { data, loading, busy: inFlight > 0, error, mutate };
}
