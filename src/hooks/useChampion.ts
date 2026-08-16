import { useCallback, useEffect, useRef, useState } from "react";
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
  // The day the NEWEST ask was for. A landing delivers two revalidate frames to the
  // handler this render committed and THEN moves the clock, so three asks are in flight
  // across one transition and the last to settle is not the last to be asked. An older
  // answer landing on top is not a stale render that heals: the plinth drops a champion
  // that is not the day being asked about, so it goes bare and nothing asks again.
  const asked = useRef<number | null>(null);

  const load = useCallback(() => {
    asked.current = previous;
    if (previous === null || previous < 1) {
      setChampion(null);
      return;
    }
    apiFetch(`/api/days/${String(previous)}/results`, dayResultsSchema)
      .then((results) => {
        if (asked.current !== previous) return;
        const top = results.results[0];
        setChampion(
          top === undefined ? null : { day: results.day, result: top },
        );
      })
      .catch(() => {
        if (asked.current === previous) setChampion(null);
      });
  }, [previous]);

  useEffect(load, [load]);
  // The plinth is a content surface like any other: a champion whose snap is torn up
  // stops being one without the clock moving at all.
  useRealtimeEvents(load);

  return champion?.day === previous ? champion : null;
}
