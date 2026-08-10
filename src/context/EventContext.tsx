import { createContext, useContext, useMemo, type ReactNode } from "react";
import { eventStateSchema, type EventState } from "@shared/events";
import type { WsEvent } from "@shared/ws-events";
import { useLiveValue } from "@/hooks/useLiveValue";
import { apiFetch, readApiError } from "@/lib/api";

export type EventAction = "start" | "abort" | "next";

const SPIN_REFUSED = "The wheel would not turn";

interface EventContextValue {
  event: EventState | undefined;
  run: (action: EventAction) => Promise<void>;
  spin: () => Promise<string | null>;
}

const EventContext = createContext<EventContextValue | null>(null);

export function useEvent(): EventContextValue {
  const value = useContext(EventContext);
  if (value === null) {
    throw new Error("useEvent must be used inside EventProvider");
  }
  return value;
}

function selectEvent(event: WsEvent): EventState | null {
  return event.type === "event_changed" ? event.state : null;
}

export function EventProvider({ children }: { children: ReactNode }) {
  const event = useLiveValue(
    "/api/event",
    eventStateSchema,
    "event_changed",
    selectEvent,
  );

  const value = useMemo<EventContextValue>(
    () => ({
      event,
      run: async (action) => {
        await apiFetch(`/api/admin/event/${action}`, eventStateSchema, {
          method: "POST",
        });
      },
      // Its own call rather than a fourth `EventAction`: the winner who presses SPIN is
      // no admin, so the route is not under `/api/admin/event/`. What comes back is the
      // REFUSAL and nothing else — a phase change reaches a screen by fan-out, never
      // from the caller's own response.
      spin: async () => {
        const res = await fetch("/api/event/spin", { method: "POST" });
        return res.ok ? null : await readApiError(res, SPIN_REFUSED);
      },
    }),
    [event],
  );

  return (
    <EventContext.Provider value={value}>{children}</EventContext.Provider>
  );
}
