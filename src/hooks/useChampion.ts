import { useCallback, useEffect, useState } from "react";
import { dayResultsSchema, type DayResult } from "@shared/api";
import { useRealtimeEvents } from "@/context/WebSocketContext";
import { apiFetch } from "@/lib/api";

export interface Champion {
  /** The day the result was FETCHED for, which the plinth prints rather than deriving
   * the day a second time. The clock moves one render before the results answer for it,
   * and that render put the finished day's heading over the day before's winner. */
  day: number;
  result: DayResult;
}

export function useChampion(day: number | undefined): Champion | null {
  const [champion, setChampion] = useState<Champion | null>(null);
  const previous = day === undefined ? null : day - 1;

  const load = useCallback(() => {
    if (previous === null || previous < 1) {
      setChampion(null);
      return;
    }
    apiFetch(`/api/days/${String(previous)}/results`, dayResultsSchema)
      .then((results) => {
        const top = results.results[0];
        setChampion(
          top === undefined ? null : { day: results.day, result: top },
        );
      })
      .catch(() => {
        setChampion(null);
      });
  }, [previous]);

  useEffect(load, [load]);
  // The plinth is a content surface like any other: a champion whose snap is torn up
  // stops being one without the clock moving at all.
  useRealtimeEvents(load);

  return champion?.day === previous ? champion : null;
}
