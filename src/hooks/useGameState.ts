import { gameStateSchema, type GameState } from "@shared/state";
import type { WsEvent } from "@shared/ws-events";
import { useLiveValue } from "@/hooks/useLiveValue";

function selectState(event: WsEvent): GameState | null {
  return event.type === "state_changed" ? event.state : null;
}

export function useGameState(): GameState | undefined {
  return useLiveValue(
    "/api/state",
    gameStateSchema,
    "state_changed",
    selectState,
  );
}
