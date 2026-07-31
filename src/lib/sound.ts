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
  | "fanfare";

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

export function playCue(
  name: CueName,
  options: Partial<CueOptions> = {},
): void {
  const audio = ctx;
  const out = master;
  if (audio === null || out === null) return;
  const { gain = 1, walker = "local" } = options;
  const play = () => {
    // Checked here rather than at the top, so a cue that waited out the unlock still
    // honours a mute toggled in the meantime.
    if (!isMuted()) emit(audio, out, name, { gain, walker });
  };
  if (audio.state === "running") play();
  else void live?.then(play);
}
