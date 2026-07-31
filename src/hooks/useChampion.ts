import { useCallback, useEffect, useState } from "react";
import { dayResultsSchema, type DayResult } from "@shared/api";
import { apiFetch } from "@/lib/api";

export function useChampion(day: number | undefined): DayResult | null {
  const [champion, setChampion] = useState<DayResult | null>(null);

  const load = useCallback(() => {
    if (day === undefined || day <= 1) {
      setChampion(null);
      return;
    }
    const previous = day - 1;
    apiFetch(`/api/days/${String(previous)}/results`, dayResultsSchema)
      .then((results) => {
        setChampion(results.results[0] ?? null);
      })
      .catch(() => {
        setChampion(null);
      });
  }, [day]);

  useEffect(load, [load]);

  return champion;
}
