import { z } from "zod";

const trackIdSchema = z.string().min(1).max(120);

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

/** Null before the start too, which is a screen whose clock trails the DO's: a negative
 * offset is worse than a beat of silence. */
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
  /** The stem, and the track's id. NOT its URL: the bundler puts a content hash in that,
   * and a stored id has to name the same record across a redeploy. */
  id: string;
  artist: string | null;
  title: string;
}

const SEPARATOR = " - ";

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
