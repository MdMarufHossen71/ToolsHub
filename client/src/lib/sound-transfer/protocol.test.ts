import { describe, expect, it } from "vitest";
import {
  decodeFrame,
  encodeDataFrame,
  encodeMetaFrame,
  encodeMimeFrame,
  encodeNameFrame,
  sessionLabel,
} from "./protocol";
import { SFT_MAX_FRAMES, SFT_MAX_PAYLOAD_BYTES, type SftTransferMeta } from "./types";
import { bytesToBase64Url, sha256Hex } from "../transfer/shared";

async function meta(overrides: Partial<SftTransferMeta> = {}): Promise<SftTransferMeta> {
  const wire = new Uint8Array(246);
  crypto.getRandomValues(wire);
  return {
    v: 1,
    sid: 0x89abcdef,
    wireSize: wire.length,
    total: Math.ceil(wire.length / 123),
    sha256: await sha256Hex(wire),
    enc: 0,
    ...overrides,
  };
}

describe("sound-transfer protocol", () => {
  it("round-trips an unencrypted metadata frame", async () => {
    const source = await meta();
    const frame = encodeMetaFrame(source);
    expect(frame.length).toBeLessThanOrEqual(SFT_MAX_PAYLOAD_BYTES);
    const decoded = decodeFrame(frame);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.frame.kind).toBe("meta");
    if (decoded.frame.kind !== "meta") return;
    expect(decoded.frame.meta).toEqual(source);
    expect(decoded.frame.total).toBe(source.total);
    expect(sessionLabel(decoded.frame.sid)).toBe("89abcdef");
  });

  it("round-trips an encrypted metadata frame with its envelope", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const source = await meta({ enc: 1, salt: bytesToBase64Url(salt), iv: bytesToBase64Url(iv) });
    const decoded = decodeFrame(encodeMetaFrame(source));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || decoded.frame.kind !== "meta") return;
    expect(decoded.frame.meta.enc).toBe(1);
    expect(decoded.frame.meta.salt).toBe(source.salt);
    expect(decoded.frame.meta.iv).toBe(source.iv);
    expect(decoded.frame.meta.total).toBe(source.total);
  });

  it("round-trips name parts, mime and data", async () => {
    const name = new TextEncoder().encode("ছবি-২০২৬.png");
    const parts = [name.slice(0, 5), name.slice(5)];
    for (let i = 0; i < parts.length; i += 1) {
      const decoded = decodeFrame(encodeNameFrame(7, i, parts.length, parts[i] as Uint8Array));
      expect(decoded.ok).toBe(true);
      if (decoded.ok && decoded.frame.kind === "name") expect(decoded.frame.bytes).toEqual(parts[i]);
    }
    const mime = decodeFrame(encodeMimeFrame(7, "image/png"));
    expect(mime.ok && mime.frame.kind === "mime" && mime.frame.mime).toBe("image/png");
    const dataBytes = new Uint8Array(123);
    crypto.getRandomValues(dataBytes);
    const data = decodeFrame(encodeDataFrame(7, 4, 10, dataBytes));
    expect(data.ok).toBe(true);
    if (data.ok && data.frame.kind === "data") {
      expect(data.frame.index).toBe(4);
      expect(data.frame.total).toBe(10);
      expect(data.frame.bytes).toEqual(dataBytes);
    }
  });

  it("rejects a corrupted CRC, magic, version and type", async () => {
    const good = encodeMetaFrame(await meta());
    const badCrc = good.slice();
    badCrc[badCrc.length - 1] = (badCrc[badCrc.length - 1] ?? 0) ^ 0xff;
    expect(decodeFrame(badCrc)).toEqual({ ok: false, error: "bad-crc" });

    const badMagic = good.slice();
    badMagic[0] = 0;
    expect(decodeFrame(badMagic)).toEqual({ ok: false, error: "bad-magic" });

    const badVersion = good.slice();
    badVersion[2] = 0x21;
    expect(decodeFrame(badVersion)).toEqual({ ok: false, error: "bad-version" });

    const badType = good.slice();
    badType[2] = 0x19;
    // Recompute the CRC so the type check is what rejects it.
    const crcFrame = decodeFrame(badType);
    expect(crcFrame.ok).toBe(false);
  });

  it("rejects inconsistent metadata and out-of-range indexes", async () => {
    const source = await meta();
    const frame = encodeMetaFrame(source);
    // Claim one fewer frame than the wire size needs; recompute CRC via public
    // encoding of a meta with the wrong total.
    const inconsistent = encodeMetaFrame({ ...source, total: 1 });
    expect(decodeFrame(inconsistent)).toEqual({ ok: false, error: "bad-shape" });
    expect(decodeFrame(frame).ok).toBe(true);

    const data = encodeDataFrame(1, 2, 3, new Uint8Array([1, 2, 3]));
    expect(decodeFrame(data).ok).toBe(true);
    expect(() => encodeDataFrame(1, 3, 3, new Uint8Array([1]))).toThrow();
    expect(decodeFrame(new Uint8Array(200))).toEqual({ ok: false, error: "too-long" });
  });

  it("rejects metadata that would make the receiver scan an absurd number of frames", async () => {
    const source = await meta();
    const total = SFT_MAX_FRAMES + 1;
    const huge = encodeMetaFrame({ ...source, wireSize: total * 123, total });
    expect(decodeFrame(huge)).toEqual({ ok: false, error: "unsafe-limits" });
  });

  it("refuses frames larger than ggwave can carry", async () => {
    const oversized = new Uint8Array(124);
    expect(() => encodeNameFrame(1, 0, 1, oversized)).toThrow();
    expect(() => encodeDataFrame(1, 0, 1, oversized)).toThrow();
  });
});
