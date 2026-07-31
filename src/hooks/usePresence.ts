import { useCallback, useRef, useState, type RefObject } from "react";
import type { WsEvent } from "@shared/ws-events";
import {
  useAnnouncePresence,
  useRealtimeEvent,
  useSaySomething,
  type Standing,
} from "@/context/WebSocketContext";
import {
  applyPresence,
  remoteStep,
  type RemoteStep,
  type Roster,
} from "@/game/presence";

export interface Presence {
  roster: RefObject<Roster>;
  names: string[];
  announce: (standing: Standing) => void;
  say: (text: string) => void;
}

export function usePresence(hear: (step: RemoteStep) => void): Presence {
  const roster = useRef<Roster>(new Map());
  const [names, setNames] = useState<string[]>([]);

  const onPresence = useCallback(
    (event: WsEvent) => {
      // Asked FIRST: the tile somebody came from is gone the moment the roster moves
      // on, and it is what tells a step from a keep-alive repeat.
      const step = remoteStep(roster.current, event);
      const next = applyPresence(roster.current, event, performance.now());
      // `applyPresence` hands back the same map when nothing changed, which is what
      // keeps a repeated frame from re-rendering anything.
      if (next !== roster.current) {
        roster.current = next;
        const nextNames = [...next.values()]
          .map((player) => player.name)
          .sort();
        setNames((current) =>
          current.length === nextNames.length &&
          current.every((name, index) => name === nextNames[index])
            ? current
            : nextNames,
        );
      }
      if (step !== null) hear(step);
    },
    [hear],
  );

  useRealtimeEvent("presence_here", onPresence);
  useRealtimeEvent("presence_moved", onPresence);
  useRealtimeEvent("presence_said", onPresence);
  useRealtimeEvent("presence_left", onPresence);

  return {
    roster,
    names,
    announce: useAnnouncePresence(),
    say: useSaySomething(),
  };
}
