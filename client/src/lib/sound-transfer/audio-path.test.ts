/**
 * End-to-end audio path, without speakers or a microphone: real ggwave
 * waveforms -> silence segmenter -> real ggwave decoder -> frame receiver.
 * This is the layer a device smoke test would exercise, minus the hardware.
 */
import { describe, expect, it } from "vitest";
import { decodePayload, encodePayload } from "./modem";
import { SftReceiver } from "./receiver";
import { SoundSegmenter } from "./segmenter";
import { prepareTransfer } from "./sender";
import { SFT_DEFAULT_GAP_MS, type SftProtocol } from "./types";

const RATE = 48000;
const BLOCK = 4096;

function silence(seconds: number): Float32Array {
  return new Float32Array(Math.ceil(seconds * RATE));
}

/** Feed arbitrary samples to the segmenter in its normal block size. */
function feed(segmenter: SoundSegmenter, samples: Float32Array): Float32Array[] {
  const out: Float32Array[] = [];
  for (let offset = 0; offset < samples.length; offset += BLOCK) {
    const chunk = samples.subarray(offset, Math.min(samples.length, offset + BLOCK));
    const segment = segmenter.push(chunk);
    if (segment) out.push(segment);
  }
  return out;
}

async function receiveAudio(
  frames: { payload: Uint8Array }[],
  protocol: SftProtocol,
): Promise<{ receiver: SftReceiver; decoded: number }> {
  const receiver = new SftReceiver();
  const segmenter = new SoundSegmenter({ sampleRate: RATE });
  // Calibration: the segmenter learns the room before accepting sound.
  expect(feed(segmenter, silence(1.3))).toHaveLength(0);
  let decoded = 0;

  for (const frame of frames) {
    const wave = await encodePayload(frame.payload, protocol);
    const segments = feed(segmenter, wave);
    const tail = feed(segmenter, silence(SFT_DEFAULT_GAP_MS / 1000 + 0.4));
    segments.push(...tail);
    for (const segment of segments) {
      const payload = await decodePayload(segment);
      if (!payload) continue;
      receiver.ingest(payload);
      decoded += 1;
    }
  }
  return { receiver, decoded };
}

describe("sound-transfer audio path", () => {
  it(
    "carries a framed file through ggwave and the silence splitter",
    async () => {
      const plain = new TextEncoder().encode("sound only, no network");
      const prepared = await prepareTransfer({
        name: "audio.txt",
        mime: "text/plain",
        bytes: plain,
        protocol: "fastest",
      });

      const { receiver, decoded } = await receiveAudio(prepared.frames, "fastest");
      expect(decoded).toBeGreaterThanOrEqual(prepared.frames.length);
      expect(receiver.complete).toBe(true);
      expect(receiver.name).toBe("audio.txt");
      const out = await receiver.reassemble();
      expect(out.bytes).toEqual(plain);
    },
    30_000,
  );

  it("applies the per-frame CRC before accepting a decoded packet", async () => {
    // ggwave's Reed-Solomon layer may already reject the noise, but if a packet
    // does come through the CRC must be what stops it.
    const prepared = await prepareTransfer({
      name: "x.txt",
      mime: "text/plain",
      bytes: new TextEncoder().encode("x"),
      protocol: "fastest",
    });
    const good = prepared.dataFrames[0]?.payload as Uint8Array;
    const receiver = new SftReceiver();
    for (const header of prepared.headerFrames) receiver.ingest(header.payload);

    const wave = await encodePayload(good, "fastest");
    const segmenter = new SoundSegmenter({ sampleRate: RATE });
    feed(segmenter, silence(1.3));
    const segments = feed(segmenter, wave);
    segments.push(...feed(segmenter, silence(SFT_DEFAULT_GAP_MS / 1000 + 0.4)));
    expect(segments).toHaveLength(1);

    const payload = await decodePayload(segments[0] as Float32Array);
    expect(payload).toEqual(good);
    const corrupt = (payload as Uint8Array).slice();
    corrupt[corrupt.length - 1] = (corrupt[corrupt.length - 1] ?? 0) ^ 0xff;
    expect(receiver.ingest(corrupt).kind).toBe("invalid");
  }, 30_000);
});
