import { z } from "zod";

/**
 * The one exception to "sound is synthesised, no assets" (`docs/SPEC.md`): the shelf is
 * a directory of files under `src/assets/`, and what crosses the wire is which one is
 * on and when it started — never who put it there.
 */

const trackIdSchema = z.string().min(1).max(120);

/**
 * Nothing is considered playing longer than this. A record's end is CLOCK-DERIVED and no
 * alarm is ever set for one — the DO has a single slot and the event's deadlines own
 * it — so a state nobody cleared has to expire when it is read, and this is what lets it.
 */
export const RECORD_MAX_MS = 15 * 60 * 1000;

const recordSchema = z.object({
  trackId: trackIdSchema,
  startedAt: z.int().positive(),
  endsAt: z.int().positive(),
});

export type PlayingRecord = z.infer<typeof recordSchema>;

export const jukeboxStateSchema = z.object({
  playing: recordSchema.nullable(),
});

export type JukeboxState = z.infer<typeof jukeboxStateSchema>;

export const SILENT: JukeboxState = { playing: null };

/** The duration is read off the presser's own media element, so it is a number a client
 * supplied: bounded here rather than trusted, and refused rather than clamped, because a
 * silently shortened record is a cabinet that goes dark mid-song. */
export const putRecordSchema = z.object({
  trackId: trackIdSchema,
  durationMs: z.int().positive().max(RECORD_MAX_MS),
});

export type PutRecord = z.infer<typeof putRecordSchema>;

export function startedRecord(press: PutRecord, now: number): PlayingRecord {
  return {
    trackId: press.trackId,
    startedAt: now,
    endsAt: now + press.durationMs,
  };
}

export interface NowPlaying {
  trackId: string;
  offsetMs: number;
}

/**
 * What is playing and how far in, from a state and a `now` — the ONE reader, so the
 * lights, the seek and the late join cannot disagree. Null the moment the record is over,
 * past the ceiling, or (a screen whose clock trails the DO's) not started yet.
 */
export function nowPlaying(
  state: JukeboxState,
  now: number,
): NowPlaying | null {
  const record = state.playing;
  if (record === null) return null;
  if (now < record.startedAt) return null;
  if (now >= record.endsAt) return null;
  if (now - record.startedAt >= RECORD_MAX_MS) return null;
  return { trackId: record.trackId, offsetMs: now - record.startedAt };
}

const PRESS_MIN_INTERVAL_MS = 5_000;

export function isPressTooSoon(pressedAt: number | null, now: number): boolean {
  return pressedAt !== null && now - pressedAt < PRESS_MIN_INTERVAL_MS;
}

export interface TrackName {
  /** The filename's stem, and the track's id. NOT its URL: the bundler puts a content
   * hash in that, and an id has to name the same record across a redeploy. */
  id: string;
  artist: string | null;
  title: string;
}

const SEPARATOR = " - ";

/** `Artist - Song title.<ext>`, the convention the shelf's README states. A stem with no
 * separator is all title: a filename is the only thing the shelf knows. */
export function trackNameOf(path: string): TrackName {
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const dot = filename.lastIndexOf(".");
  const id = dot > 0 ? filename.slice(0, dot) : filename;
  const split = id.indexOf(SEPARATOR);
  if (split === -1) return { id, artist: null, title: id };
  return {
    id,
    artist: id.slice(0, split),
    title: id.slice(split + SEPARATOR.length),
  };
}
