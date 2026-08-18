// INERT until `unlockAudio()` runs, because a browser refuses an AudioContext outside a
// user gesture: cues played before that are DROPPED rather than queued, which is why a
// load that skips the splash is a silent session.
//
// Every cue is a `Note` or a sequence of them, scheduled down ONE path — do not add a
// second for a new wave.

import { isWalkableTile, type WalkableTile } from "@shared/map";

export interface Note {
  wave: "square" | "triangle" | "noise";
  from: number;
  to: number;
  seconds: number;
  peak: number;
  attack: number;
  q?: number;
}

type Cue = Note | readonly Note[];

// Only the cues something plays: knip fails on one nothing calls.
type CueName =
  | "stepGrass"
  | "stepTallGrass"
  | "stepPath"
  | "stepSand"
  | "stepFloor"
  | "bump"
  | "blip"
  | "confirm"
  | "door"
  | "start"
  | "tick"
  | "wheelTick"
  | "fanfare"
  | "squelchOpen"
  | "squelchClose";

export const CUES: Record<CueName, Cue> = {
  stepGrass: {
    wave: "noise",
    from: 1500,
    to: 900,
    seconds: 0.045,
    peak: 0.26,
    attack: 0.14,
    q: 1.2,
  },
  stepTallGrass: {
    wave: "noise",
    from: 1080,
    to: 520,
    seconds: 0.075,
    peak: 0.3,
    attack: 0.22,
    q: 0.8,
  },
  stepPath: {
    wave: "noise",
    from: 620,
    to: 380,
    seconds: 0.04,
    peak: 0.24,
    attack: 0.1,
    q: 2.4,
  },
  stepSand: {
    wave: "noise",
    from: 2600,
    to: 1600,
    seconds: 0.085,
    peak: 0.22,
    attack: 0.3,
    q: 0.6,
  },
  stepFloor: {
    wave: "triangle",
    from: 260,
    to: 130,
    seconds: 0.055,
    peak: 0.34,
    attack: 0.06,
  },
  bump: {
    wave: "triangle",
    from: 165,
    to: 72,
    seconds: 0.11,
    peak: 0.5,
    attack: 0.07,
  },
  blip: {
    wave: "square",
    from: 1000,
    to: 940,
    seconds: 0.022,
    peak: 0.2,
    attack: 0.3,
  },
  confirm: [
    {
      wave: "square",
      from: 640,
      to: 640,
      seconds: 0.04,
      peak: 0.36,
      attack: 0.15,
    },
    {
      wave: "square",
      from: 960,
      to: 1080,
      seconds: 0.06,
      peak: 0.4,
      attack: 0.12,
    },
  ],
  door: [
    {
      wave: "noise",
      from: 620,
      to: 1020,
      seconds: 0.07,
      peak: 0.3,
      attack: 0.5,
      q: 18,
    },
    {
      wave: "noise",
      from: 880,
      to: 1320,
      seconds: 0.08,
      peak: 0.34,
      attack: 0.45,
      q: 22,
    },
    {
      wave: "noise",
      from: 1160,
      to: 1680,
      seconds: 0.09,
      peak: 0.26,
      attack: 0.4,
      q: 26,
    },
  ],
  start: [
    {
      wave: "square",
      from: 523,
      to: 523,
      seconds: 0.06,
      peak: 0.3,
      attack: 0.12,
    },
    {
      wave: "square",
      from: 659,
      to: 659,
      seconds: 0.06,
      peak: 0.32,
      attack: 0.12,
    },
    {
      wave: "square",
      from: 784,
      to: 784,
      seconds: 0.06,
      peak: 0.34,
      attack: 0.12,
    },
    {
      wave: "square",
      from: 1047,
      to: 1047,
      seconds: 0.15,
      peak: 0.36,
      attack: 0.08,
    },
  ],
  tick: {
    wave: "square",
    from: 880,
    to: 760,
    seconds: 0.05,
    peak: 0.3,
    attack: 0.1,
  },
  wheelTick: {
    wave: "noise",
    from: 2200,
    to: 1800,
    seconds: 0.025,
    peak: 0.22,
    attack: 0.12,
    q: 8,
  },
  fanfare: [
    {
      wave: "square",
      from: 523,
      to: 523,
      seconds: 0.09,
      peak: 0.32,
      attack: 0.1,
    },
    {
      wave: "square",
      from: 659,
      to: 659,
      seconds: 0.09,
      peak: 0.34,
      attack: 0.1,
    },
    {
      wave: "square",
      from: 784,
      to: 784,
      seconds: 0.09,
      peak: 0.36,
      attack: 0.1,
    },
    {
      wave: "triangle",
      from: 1047,
      to: 1568,
      seconds: 0.18,
      peak: 0.4,
      attack: 0.08,
    },
  ],
  squelchOpen: [
    {
      wave: "square",
      from: 1180,
      to: 1560,
      seconds: 0.035,
      peak: 0.3,
      attack: 0.2,
    },
    {
      wave: "noise",
      from: 2400,
      to: 1300,
      seconds: 0.05,
      peak: 0.2,
      attack: 0.25,
      q: 3,
    },
  ],
  squelchClose: [
    {
      wave: "noise",
      from: 1500,
      to: 700,
      seconds: 0.055,
      peak: 0.2,
      attack: 0.25,
      q: 3,
    },
    {
      wave: "square",
      from: 720,
      to: 480,
      seconds: 0.045,
      peak: 0.28,
      attack: 0.2,
    },
  ],
};

/** Keyed by the walkable UNION, so a tile that becomes walkable is a type error here
 * until somebody decides what it sounds like. */
const SURFACE_CUES: Record<WalkableTile, CueName> = {
  ".": "stepGrass",
  F: "stepGrass",
  t: "stepTallGrass",
  P: "stepPath",
  s: "stepSand",
  f: "stepFloor",
};

export function footstepCue(tile: string): CueName {
  return isWalkableTile(tile) ? SURFACE_CUES[tile] : SURFACE_CUES["."];
}

const FOOTSTEPS = new Set<string>(Object.values(SURFACE_CUES));

const MASTER_GAIN = 0.12;

const DEFAULT_Q = 1;

const NOISE_SECONDS = 0.4;

const FOOTSTEP_ALTERNATION = 0.92;

/** TWO counters, because feeding a friend's steps through the local one makes the local
 * player's own walk stutter. */
type Walker = "local" | "remote";

export interface CueOptions {
  gain: number;
  walker: Walker;
}

interface EnvelopePoint {
  time: number;
  gain: number;
}

export function envelope(note: Note): EnvelopePoint[] {
  return [
    { time: 0, gain: 0 },
    { time: note.seconds * note.attack, gain: note.peak },
    { time: note.seconds, gain: 0 },
  ];
}

export interface ScheduledNote {
  note: Note;
  at: number;
}

export function notesOf(cue: Cue): ScheduledNote[] {
  const sequence = "wave" in cue ? [cue] : cue;
  let at = 0;
  return sequence.map((note) => {
    const scheduled = { note, at };
    at += note.seconds;
    return scheduled;
  });
}

export function footstepPitch(step: number): number {
  return step % 2 === 0 ? 1 : FOOTSTEP_ALTERNATION;
}

const MUTE_KEY = "ignis-snaps.muted";

/** Read lazily: `localStorage` is absent in the unit-test runtime, and a locked-down
 * browser throws on merely touching it. */
function store(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

let muted: boolean | null = null;

export function isMuted(): boolean {
  muted ??= store()?.getItem(MUTE_KEY) === "1";
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  store()?.setItem(MUTE_KEY, next ? "1" : "0");
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let live: Promise<void> | null = null;
let noise: AudioBuffer | null = null;
const footsteps: Record<Walker, number> = { local: 0, remote: 0 };

function noiseBuffer(audio: AudioContext): AudioBuffer {
  if (noise !== null) return noise;
  const frames = Math.floor(audio.sampleRate * NOISE_SECONDS);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    channel[i] = Math.random() * 2 - 1;
  }
  noise = buffer;
  return buffer;
}

interface Voice {
  source: AudioScheduledSourceNode;
  sweep: AudioParam;
  tail: AudioNode;
}

function voice(audio: AudioContext, note: Note): Voice {
  if (note.wave === "noise") {
    const source = audio.createBufferSource();
    source.buffer = noiseBuffer(audio);
    source.loop = true;
    const band = audio.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = note.q ?? DEFAULT_Q;
    source.connect(band);
    return { source, sweep: band.frequency, tail: band };
  }
  const osc = audio.createOscillator();
  osc.type = note.wave;
  return { source: osc, sweep: osc.frequency, tail: osc };
}

function playNote(
  audio: AudioContext,
  out: AudioNode,
  note: Note,
  start: number,
  bend: number,
  level: number,
): void {
  const gain = audio.createGain();
  envelope(note).forEach((point, index) => {
    const at = start + point.time;
    const value = point.gain * level;
    // Without this first point the node's default gain of 1 would be what the ramps
    // start from.
    if (index === 0) gain.gain.setValueAtTime(value, at);
    else gain.gain.linearRampToValueAtTime(value, at);
  });
  gain.connect(out);

  const { source, sweep, tail } = voice(audio, note);
  sweep.setValueAtTime(note.from * bend, start);
  sweep.linearRampToValueAtTime(note.to * bend, start + note.seconds);
  tail.connect(gain);
  source.start(start);
  source.stop(start + note.seconds);
  source.onended = () => {
    source.disconnect();
    tail.disconnect();
    gain.disconnect();
  };
}

function emit(
  audio: AudioContext,
  out: AudioNode,
  name: CueName,
  { gain, walker }: CueOptions,
): void {
  let bend = 1;
  if (FOOTSTEPS.has(name)) {
    bend = footstepPitch(footsteps[walker]);
    footsteps[walker] += 1;
  }
  const start = audio.currentTime;
  for (const { note, at } of notesOf(CUES[name])) {
    playNote(audio, out, note, start + at, bend, gain);
  }
}

export function unlockAudio(): void {
  if (ctx !== null || typeof AudioContext === "undefined") return;
  const audio = new AudioContext();
  const gain = audio.createGain();
  gain.gain.value = MASTER_GAIN;
  gain.connect(audio.destination);
  ctx = audio;
  master = gain;
  // Remembered rather than merely fired: a context that is not running has a
  // `currentTime` that is not moving, so the START chime asked for on this same gesture
  // would be swallowed. Safari resolves a tick late — never paper over that with a
  // timeout at a call site.
  live = audio.resume().catch(() => {
    // The gesture was not good enough for this browser; cues stay silent.
  });
}

function whenLive(body: (audio: AudioContext, out: AudioNode) => void): void {
  const audio = ctx;
  const out = master;
  if (audio === null || out === null) return;
  const run = () => {
    body(audio, out);
  };
  if (audio.state === "running") run();
  else void live?.then(run);
}

export function playCue(
  name: CueName,
  options: Partial<CueOptions> = {},
): void {
  const { gain = 1, walker = "local" } = options;
  whenLive((audio, out) => {
    // Checked here rather than before the wait, so a cue that waited out the unlock
    // still honours a mute toggled in the meantime.
    if (!isMuted()) emit(audio, out, name, { gain, walker });
  });
}

/** Capture needs a context and iOS caps how many a page may have, so voice borrows this
 * module's rather than opening a second one that would fight it for the audio session.
 * Null until `unlockAudio` has run. */
export function audioContext(): AudioContext | null {
  return ctx;
}

const VOICE_GAIN = 2.4;

const VOICE_LEAD_SECONDS = 0.08;

/** A cursor that has fallen behind the clock must not schedule into the past — the
 * browser would play those buffers all at once, on top of each other. */
export function nextPlayAt(cursor: number, now: number, lead: number): number {
  return Math.max(cursor, now + lead);
}

let voiceCursor = 0;

const RECORD_GAIN = 1.8;

/** ONE element, `src` swapped: `createMediaElementSource` throws on a second call for the
 * same element, and a four-minute file decoded to a PCM buffer is tens of megabytes on a
 * phone. Routed into `master` rather than played bare, so the cues and the record are
 * levelled in one place — which is the whole reason this lives beside `speakSamples` and
 * not in a module calling the exported `audioContext()`, where only `ctx.destination` is
 * reachable and a record lands several times louder than every cue. */
let record: HTMLAudioElement | null = null;

function recordElement(audio: AudioContext, out: AudioNode): HTMLAudioElement {
  if (record !== null) return record;
  const element = new Audio();
  element.crossOrigin = "anonymous";
  element.preload = "auto";
  const gain = audio.createGain();
  gain.gain.value = RECORD_GAIN;
  audio.createMediaElementSource(element).connect(gain);
  gain.connect(out);
  record = element;
  return element;
}

/**
 * Seeks to where the town already is. An autoplay refusal is SILENT — no throw, no retry,
 * no dark cabinet on a screen the town is playing to: the lights read the shared state, not
 * this element. A screen with no AudioContext hears nothing at all, which is the limit
 * `src/CLAUDE.md` already documents.
 */
export function playRecord(url: string, offsetSeconds: number): void {
  whenLive((audio, out) => {
    const element = recordElement(audio, out);
    if (element.src !== url) element.src = url;
    element.currentTime = offsetSeconds;
    element.play().catch(() => {
      // This browser wants a gesture it has not had. Nothing to say about it.
    });
  });
}

export function stopRecord(): void {
  record?.pause();
}

/** The duration the press has to carry, read off a throwaway element rather than the
 * playing one: measuring on that would interrupt whatever is already on. No AudioContext is
 * involved, so this opens no second one. Null when the browser could not read it — which is
 * what a file that is not there looks like, since a missing asset URL answers `index.html`
 * with a 200 rather than a 404. */
export async function recordDurationMs(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = "metadata";
    probe.addEventListener("loadedmetadata", () => {
      const seconds = probe.duration;
      resolve(
        Number.isFinite(seconds) && seconds > 0
          ? Math.round(seconds * 1000)
          : null,
      );
    });
    probe.addEventListener("error", () => {
      resolve(null);
    });
    probe.src = url;
  });
}

/** Deliberately does NOT ask `isMuted()`: mute is for the synthesised cues, and a muted
 * player still hears their friends. */
export function speakSamples(samples: Float32Array, rate: number): void {
  if (samples.length === 0) return;
  whenLive((audio, out) => {
    const buffer = audio.createBuffer(1, samples.length, rate);
    buffer.getChannelData(0).set(samples);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const gain = audio.createGain();
    gain.gain.value = VOICE_GAIN;
    source.connect(gain);
    gain.connect(out);
    const at = nextPlayAt(voiceCursor, audio.currentTime, VOICE_LEAD_SECONDS);
    voiceCursor = at + samples.length / rate;
    source.start(at);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  });
}
