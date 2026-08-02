// ONE format crosses the wire: 8 kHz signed 16-bit mono PCM, little-endian. Chosen over
// `MediaRecorder` because that yields webm/opus on Chrome and mp4/aac on Safari — two
// formats to relay, and every chunk after the first a headerless container fragment that
// needs MSE, which iOS Safari will not give you for those types. A receiver here is
// never asked which browser produced the bytes.

import { audioContext, speakSamples } from "@/lib/sound";

export const VOICE_SAMPLE_RATE = 8_000;

/** 4096 frames at 48 kHz is ~85 ms, so ~12 sockets frames a second rather than the ~47
 * a 1024-frame buffer would cost. */
const CAPTURE_BUFFER = 4096;

const FULL_SCALE = 0x7fff;

export function toPcm16(samples: Float32Array): ArrayBuffer {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    out[i] = Math.round(sample * FULL_SCALE);
  }
  return out.buffer;
}

export function fromPcm16(bytes: ArrayBuffer): Float32Array {
  // Counted rather than inferred: `new Int16Array(bytes)` THROWS on an odd byte count,
  // and a chunk truncated in flight would take the whole playback path down with it.
  const source = new Int16Array(bytes, 0, Math.floor(bytes.byteLength / 2));
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i++) {
    out[i] = (source[i] ?? 0) / FULL_SCALE;
  }
  return out;
}

/** Nearest-neighbour on purpose: the band this carries is a voice on a walkie-talkie,
 * and an interpolating resampler is a wasm-sized answer to a problem nobody can hear. */
export function downsample(
  input: Float32Array,
  from: number,
  to: number,
): Float32Array {
  if (from <= to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    out[i] = input[Math.floor(i * ratio)] ?? 0;
  }
  return out;
}

export function hearVoice(bytes: ArrayBuffer): void {
  speakSamples(fromPcm16(bytes), VOICE_SAMPLE_RATE);
}

export interface Capture {
  stop: () => void;
}

/**
 * `ScriptProcessorNode`, deprecated and still working in every browser fourteen friends
 * own, over `AudioWorkletNode`, which is the current API and needs a separate module
 * emitted as its own Vite chunk plus a second message channel to reach it. For a
 * half-duplex 8 kHz channel that is a build-graph change bought for nothing.
 *
 * Resolves null when the browser refuses the microphone; the caller must not ask again
 * on the next press.
 */
/* eslint-disable @typescript-eslint/no-deprecated -- the whole point of the choice
   above: `ScriptProcessorNode` and its `audioprocess` event are deprecated and are
   still the only capture path that costs no build-graph change. */
export async function startCapture(
  send: (bytes: ArrayBuffer) => void,
): Promise<Capture | null> {
  const audio = audioContext();
  if (audio === null) return null;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch {
    return null;
  }
  const source = audio.createMediaStreamSource(stream);
  const processor = audio.createScriptProcessor(CAPTURE_BUFFER, 1, 1);
  processor.onaudioprocess = (event) => {
    const samples = downsample(
      event.inputBuffer.getChannelData(0),
      audio.sampleRate,
      VOICE_SAMPLE_RATE,
    );
    send(toPcm16(samples));
  };
  // Muted rather than merely connected: a `ScriptProcessorNode` only runs once it
  // reaches a destination, and reaching the real one would put the speaker's own voice
  // back out of their own speaker.
  const sink = audio.createGain();
  sink.gain.value = 0;
  source.connect(processor);
  processor.connect(sink);
  sink.connect(audio.destination);
  return {
    stop: () => {
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      sink.disconnect();
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    },
  };
}
