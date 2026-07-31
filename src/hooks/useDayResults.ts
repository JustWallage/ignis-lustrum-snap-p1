import { useEffect } from "react";
import { dayResultsSchema, type DayResult } from "@shared/api";
import { useRealtimeEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";

/**
 * One hook rather than two fetches: the podium and the wheel's last page ask for the same
 * day at the same moment, so `useCachedFetch` serves the second from the cache.
 *
 * A screen may ASK a beat early — it renders off the fan-out while `game_state` is still
 * being mirrored — so this keeps asking until something comes back: every realtime frame
 * is a chance, plus a plain retry, because a podium waiting on the host fans out nothing
 * for ninety seconds.
 */

const RETRY_MS = 1_000;

export function useDayResults(day: number): DayResult[] | undefined {
  const { data, mutate } = useCachedFetch(
    `/api/days/${String(day)}/results`,
    dayResultsSchema,
  );
  useRealtimeEvents(mutate);

  useEffect(() => {
    if (data !== undefined) return;
    const timer = setInterval(mutate, RETRY_MS);
    return () => {
      clearInterval(timer);
    };
  }, [data, mutate]);

  return data?.results;
}
