import { nowPlaying, type JukeboxState } from "@shared/jukebox";
import type { ShelfRecord } from "@/lib/shelf";

export interface RecordCue {
  url: string;
  /** Where in the record this screen starts, so a late join lands where the town already
   * is rather than at the top. */
  offsetSeconds: number;
}

/**
 * What THIS screen should be playing. Nothing here decides what is on — that is the shared
 * state's answer — and nothing here counts anything down.
 *
 * A track id the shelf does not have plays silence: the Worker holds no copy of a
 * build-time glob, so a stale id survives a redeploy that removed the file, and anybody may
 * stop it or put another on.
 */
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

/** Lit or dark, from the shared state and a `now` — never from this screen's own audio, so
 * a muted friend and one whose browser refused to autoplay still see the town's cabinet
 * lit, and nothing is left on screen after a record has ended. */
export function isCabinetLit(state: JukeboxState, now: number): boolean {
  return nowPlaying(state, now) !== null;
}
