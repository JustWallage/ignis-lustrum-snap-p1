import { nowPlaying, type JukeboxState } from "@shared/jukebox";
import type { ShelfRecord } from "@/lib/shelf";
import type { RecordStatus } from "@/lib/sound";

export interface RecordCue {
  url: string;
  offsetSeconds: number;
}

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

export type Needle = "parked" | "cueing" | "playing";

/** The disc turns on the TOWN's record rather than on this browser's audio, the same way the
 * cabinet's lamps do — a muted screen and one whose autoplay was refused both see it lit, so
 * both see it turning. `cueing` is the ONE thing local audio decides: a download this screen
 * is still waiting on, which is the only wait a player can do nothing about and so the only
 * one worth a different look. */
export function needleAt(
  state: JukeboxState,
  now: number,
  status: RecordStatus,
): Needle {
  if (!isCabinetLit(state, now)) return "parked";
  return status === "loading" ? "cueing" : "playing";
}
