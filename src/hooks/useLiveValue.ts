import { useCallback, useState } from "react";
import type { ZodType } from "zod";
import type { WsEvent, WsEventType } from "@shared/ws-events";
import { useRealtimeEvent } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";

/** A value learned TWICE: fetched cold, then pushed. A push always beats the fetch
 * whichever order they land in. `select` must be a MODULE-LEVEL function, or the
 * subscription re-registers every render. */
export function useLiveValue<T>(
  path: string,
  schema: ZodType<T>,
  type: WsEventType,
  select: (event: WsEvent) => T | null,
): T | undefined {
  const { data } = useCachedFetch(path, schema);
  const [pushed, setPushed] = useState<T | null>(null);

  const onEvent = useCallback(
    (event: WsEvent) => {
      const next = select(event);
      if (next !== null) setPushed(next);
    },
    [select],
  );
  useRealtimeEvent(type, onEvent);

  return pushed ?? data;
}
