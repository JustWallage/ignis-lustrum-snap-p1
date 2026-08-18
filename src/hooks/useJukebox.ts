import { useCallback, useEffect, useState } from "react";
import { SILENT, type JukeboxState } from "@shared/jukebox";
import type { WsEvent } from "@shared/ws-events";
import { useRealtimeEvent } from "@/context/WebSocketContext";
import { recordCue } from "@/lib/jukebox";
import { playRecord, stopRecord } from "@/lib/sound";
import { SHELF } from "@/lib/shelf";

/**
 * What the town is playing, learned from the socket and nowhere else: there is no public
 * GET, so the greeting is the only reader and a late join lands inside the record.
 */
export function useJukebox(): JukeboxState {
  const [state, setState] = useState<JukeboxState>(SILENT);
  useRealtimeEvent(
    "presence_jukebox",
    useCallback((event: WsEvent) => {
      if (event.type === "presence_jukebox") setState(event.jukebox);
    }, []),
  );
  return state;
}

/**
 * Starts and stops this screen's own playback. Keyed on the record's own three fields
 * rather than the state OBJECT, whose identity changes on every frame the socket delivers,
 * and never on the offset, which moves continuously: the clock is read once, at the moment
 * playback begins. Nothing here ticks anything along.
 */
export function useRecordPlayback(state: JukeboxState, muted: boolean): void {
  const playing = state.playing;
  const trackId = playing?.trackId ?? null;
  const startedAt = playing?.startedAt ?? null;
  const endsAt = playing?.endsAt ?? null;

  useEffect(() => {
    const on: JukeboxState =
      trackId === null || startedAt === null || endsAt === null
        ? SILENT
        : { playing: { trackId, startedAt, endsAt } };
    const cue = recordCue(SHELF, on, Date.now(), muted);
    if (cue === null) {
      stopRecord();
      return;
    }
    playRecord(cue.url, cue.offsetSeconds);
  }, [trackId, startedAt, endsAt, muted]);
}
