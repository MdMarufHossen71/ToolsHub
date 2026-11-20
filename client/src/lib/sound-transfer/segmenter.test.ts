import { describe, expect, it } from "vitest";
import { SoundSegmenter } from "./segmenter";
import { SFT_DEFAULT_GAP_MS } from "./types";

const RATE = 48000;
const BLOCK = 4096;

function sine(amplitude: number, freq = 1200): Float32Array {
  const out = new Float32Array(BLOCK);
  for (let i = 0; i < BLOCK; i += 1) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / RATE);
  return out;
}

function run(segmenter: SoundSegmenter, seconds: number, amplitude: number): Float32Array[] {
  const segments: Float32Array[] = [];
  const blocks = Math.ceil((seconds * RATE) / BLOCK);
  for (let i = 0; i < blocks; i += 1) {
    const segment = segmenter.push(sine(amplitude));
    if (segment) segments.push(segment);
  }
  return segments;
}

describe("sound segmenter", () => {
  it("calibrates first, then splits two bursts separated by the protocol gap", () => {
    const segmenter = new SoundSegmenter({ sampleRate: RATE, chunkSamples: BLOCK });
    expect(run(segmenter, 1.5, 0.0005)).toHaveLength(0);

    expect(run(segmenter, 2, 0.2)).toHaveLength(0); // still recording
    const first = run(segmenter, SFT_DEFAULT_GAP_MS / 1000, 0.0005);
    expect(first).toHaveLength(1);
    expect(first[0]?.length).toBeGreaterThan(1.5 * RATE);

    // The gap must outlast the finalise + cooldown window; otherwise the start
    // marker of this burst would be swallowed and the frame would be lost.
    const second = run(segmenter, 2, 0.2);
    const tail = run(segmenter, 1.2, 0.0005);
    expect(second).toHaveLength(0);
    expect(tail).toHaveLength(1);
    expect(tail[0]?.length).toBeGreaterThan(1.5 * RATE);
  });

  it("ignores a short click instead of trying to decode it", () => {
    const segmenter = new SoundSegmenter({ sampleRate: RATE, chunkSamples: BLOCK });
    run(segmenter, 1.5, 0.0005);
    // One block of sound never reaches the two-block onset streak.
    run(segmenter, 0.05, 0.25);
    expect(run(segmenter, 1.2, 0.0005)).toHaveLength(0);
  });

  it("splits a burst that runs past the maximum length instead of buffering forever", () => {
    const segmenter = new SoundSegmenter({ sampleRate: RATE, chunkSamples: BLOCK, maxSeconds: 1.2 });
    run(segmenter, 1.5, 0.0005);
    const segments = run(segmenter, 2.5, 0.2);
    expect(segments).toHaveLength(2);
  });
});
