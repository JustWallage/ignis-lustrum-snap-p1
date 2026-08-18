import { nowPlaying, type JukeboxState } from "@shared/jukebox";
import type { ShelfRecord } from "@/lib/shelf";

export interface RecordCue {
  url: string;
  offsetSeconds: number;
}

/** A track id the shelf does not have plays SILENCE: the Worker holds no copy of a
 * build-time glob, so a stale id outlives the redeploy that removed the file. */
export function recordCue(
  shelf: readonly ShelfRecord[],
  state: JukeboxState,
  now: number,
  muted: boolean,
): RecordCue | null {
  if (muted) return null;
  const playing = nowPlaying(state, now);
  if (playing === null) return null;
  const record = shelf.find((one) => one.id === playing.trackId);
  if (record === undefined) return null;
  return { url: record.url, offsetSeconds: playing.offsetMs / 1000 };
}

export function isCabinetLit(state: JukeboxState, now: number): boolean {
  return nowPlaying(state, now) !== null;
}
