import { describe, expect, it } from "vitest";
import { downsample, fromPcm16, toPcm16, VOICE_SAMPLE_RATE } from "@/lib/voice";

describe("the one format that crosses the wire", () => {
  it("survives the round trip a listener has to make", () => {
    const spoken = Float32Array.from([0, 0.5, -0.5, 0.25]);
    const heard = fromPcm16(toPcm16(spoken));
    expect(heard.length).toBe(spoken.length);
    heard.forEach((sample, index) => {
      expect(sample).toBeCloseTo(spoken[index] ?? 0, 4);
    });
  });

  it("clamps rather than wrapping, so a loud voice is loud and not inverted", () => {
    const heard = fromPcm16(toPcm16(Float32Array.from([2, -2])));
    expect(heard[0]).toBeCloseTo(1, 4);
    expect(heard[1]).toBeCloseTo(-1, 4);
  });

  it("packs two bytes a sample, which is what the frame budget is counted in", () => {
    expect(toPcm16(new Float32Array(320)).byteLength).toBe(640);
  });

  it("ignores a trailing byte that cannot be half of a sample", () => {
    expect(fromPcm16(new ArrayBuffer(7)).length).toBe(3);
    expect(fromPcm16(new ArrayBuffer(0)).length).toBe(0);
  });
});

describe("downsample", () => {
  it("takes a browser's rate down to the one rate the town speaks at", () => {
    const captured = new Float32Array(4800);
    expect(downsample(captured, 48_000, VOICE_SAMPLE_RATE).length).toBe(800);
  });

  it("keeps the samples in order rather than reversing or repeating them", () => {
    const captured = Float32Array.from([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    [0, 0.2, 0.4].forEach((sample, index) => {
      expect(downsample(captured, 6, 3)[index]).toBeCloseTo(sample, 5);
    });
  });

  it("hands back a context already at or below the rate untouched", () => {
    const captured = Float32Array.from([0.1, 0.2]);
    expect(downsample(captured, 8_000, VOICE_SAMPLE_RATE)).toBe(captured);
  });
});
