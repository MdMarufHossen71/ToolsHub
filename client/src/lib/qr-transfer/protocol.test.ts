import { describe, expect, it } from "vitest";
import { countFrames, joinChunks, splitBytes } from "./chunking";
import { sanitizeFilename } from "./filename";
import { bytesToHex, crc16Ccitt, sha256Hex } from "./integrity";
import { base64UrlToBytes, bytesToBase64Url, decodeFrame, encodeDataFrame, encodeMetaFrame } from "./protocol";
import { QftReceiver } from "./receiver";
import { prepareTransfer } from "./sender";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("qr-transfer encoding", () => {
  it("round-trips small text through sender and receiver", async () => {
    const prepared = await prepareTransfer({ name: "hello.txt", mime: "text/plain", bytes: bytes("hello world") });
    const rx = new QftReceiver();
    rx.ingest(prepared.metaFrame);
    for (const frame of prepared.dataFrames) rx.ingest(frame);
    expect(rx.complete).toBe(true);
    const out = await rx.reassemble();
    expect(new TextDecoder().decode(out.bytes)).toBe("hello world");
    expect(out.name).toBe("hello.txt");
  });

  it("handles binary data byte-for-byte, including random bytes", async () => {
    const raw = new Uint8Array(2048);
    crypto.getRandomValues(raw);
    const prepared = await prepareTransfer({ name: "blob.bin", mime: "application/octet-stream", bytes: raw });
    const rx = new QftReceiver();
    rx.ingest(prepared.metaFrame);
    // Out-of-order delivery must still reassemble.
    for (const frame of [...prepared.dataFrames].reverse()) rx.ingest(frame);
    const out = await rx.reassemble();
    expect(out.bytes).toEqual(raw);
  });

  it("handles empty files intentionally", async () => {
    const prepared = await prepareTransfer({ name: "empty.txt", mime: "text/plain", bytes: new Uint8Array(0) });
    expect(prepared.meta.n).toBe(0);
    expect(prepared.dataFrames).toHaveLength(0);
    const rx = new QftReceiver();
    rx.ingest(prepared.metaFrame);
    expect(rx.complete).toBe(true);
    const out = await rx.reassemble();
    expect(out.bytes).toHaveLength(0);
  });

  it("supports unicode filenames", async () => {
    for (const name of ["বাংলা-ফাইল.txt", "emoji-📄.txt"]) {
      const prepared = await prepareTransfer({ name, mime: "text/plain", bytes: bytes("x") });
      const rx = new QftReceiver();
      rx.ingest(prepared.metaFrame);
      for (const frame of prepared.dataFrames) rx.ingest(frame);
      const out = await rx.reassemble();
      expect(out.name).toBe(name);
    }
  });
});

describe("qr-transfer chunking", () => {
  it("splits 1 chunk, 2 chunks, many chunks, exact boundary and remainder", () => {
    expect(splitBytes(new Uint8Array(10), 800)).toHaveLength(1);
    expect(splitBytes(new Uint8Array(1600), 800)).toHaveLength(2);
    expect(splitBytes(new Uint8Array(1600), 800)[0]).toHaveLength(800);
    expect(splitBytes(new Uint8Array(1601), 800)).toHaveLength(3);
    expect(splitBytes(new Uint8Array(1601), 800)[2]).toHaveLength(1);
    expect(splitBytes(new Uint8Array(0), 800)).toHaveLength(0);
    expect(countFrames(0, 800)).toBe(0);
    expect(countFrames(800, 800)).toBe(1);
    // Chunk sizes below the 100B minimum are clamped, so exercise join logic
    // with realistic sizes instead.
    const raw = new Uint8Array(250);
    for (let i = 0; i < raw.length; i += 1) raw[i] = i % 256;
    const parts = splitBytes(raw, 100);
    expect(parts).toHaveLength(3);
    expect(joinChunks(parts, 3, 250)).toEqual(raw);
  });
});

describe("qr-transfer receiver robustness", () => {
  it("stores out-of-order frames and ignores duplicates", async () => {
    const prepared = await prepareTransfer({ name: "a.bin", mime: "application/octet-stream", bytes: new Uint8Array(2500) });
    expect(prepared.meta.n).toBeGreaterThanOrEqual(3);
    const rx = new QftReceiver();
    rx.ingest(prepared.metaFrame);
    const n = prepared.dataFrames.length;
    const order = [2, 0, n - 1, 1, 0, 2, 1, n - 1];
    for (const idx of order) {
      if (idx < prepared.dataFrames.length) {
        const frame = prepared.dataFrames[idx];
        if (frame) rx.ingest(frame);
      }
    }
    expect(rx.received).toBe(prepared.meta.n);
    expect(rx.duplicates).toBeGreaterThan(0);
    expect(rx.complete).toBe(true);
  });

  it("reports missing frames as incomplete", async () => {
    const prepared = await prepareTransfer({ name: "a.bin", mime: "application/octet-stream", bytes: new Uint8Array(2500) });
    const rx = new QftReceiver();
    rx.ingest(prepared.metaFrame);
    for (let i = 0; i < prepared.dataFrames.length - 1; i += 1) {
      const frame = prepared.dataFrames[i];
      if (frame) rx.ingest(frame);
    }
    expect(rx.complete).toBe(false);
    expect(rx.missing()).toHaveLength(1);
    await expect(rx.reassemble()).rejects.toThrow("incomplete");
  });

  it("rejects corrupted payloads", () => {
    const frame = encodeDataFrame("abcdef0123456789", 0, 1, 0, bytesToBase64Url(new Uint8Array([1, 2, 3])));
    const tampered = `${frame.slice(0, frame.length - 8)}X${frame.slice(frame.length - 7)}`;
    expect(decodeFrame(tampered).ok).toBe(false);
    const rx = new QftReceiver();
    rx.ingest(tampered);
    expect(rx.invalid).toBe(1);
  });

  it("rejects invalid indexes and wrong sessions", async () => {
    expect(decodeFrame(encodeDataFrame("abcdef0123456789", -1, 2, 0, "eA")).ok).toBe(false);
    expect(decodeFrame(encodeDataFrame("abcdef0123456789", 5, 2, 0, "eA")).ok).toBe(false);
    const prepared = await prepareTransfer({ name: "a.txt", mime: "text/plain", bytes: bytes("hi") });
    const rx = new QftReceiver();
    rx.ingest(prepared.metaFrame);
    rx.ingest(encodeDataFrame("ffffffffffffffff", 0, 1, 0, bytesToBase64Url(bytes("x"))));
    expect(rx.wrongSession).toBe(1);
    expect(rx.received).toBe(0);
  });

  it("rejects invalid metadata and enforces safety caps", () => {
    expect(decodeFrame("not json").ok).toBe(false);
    expect(decodeFrame(JSON.stringify({ v: 99, t: "data" })).ok).toBe(false);
    const evil = encodeMetaFrame({
      v: 1,
      sid: "abcdef0123456789",
      name: "x",
      mime: "text/plain",
      size: 10,
      n: 999999,
      chunk: 800,
      sha256: "0".repeat(64),
      enc: 0,
    });
    expect(decodeFrame(evil)).toEqual({ ok: false, error: "unsafe-limits" });
  });

  it("sanitizes malicious filenames", () => {
    expect(sanitizeFilename("../../malicious.exe")).toBe("malicious.exe");
    expect(sanitizeFilename("/etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..")).toBe("download.bin");
    expect(sanitizeFilename("")).toBe("download.bin");
    expect(sanitizeFilename(null)).toBe("download.bin");
  });

  it("verifies binary integrity end to end and fails on tamper", async () => {
    const raw = new Uint8Array(900);
    crypto.getRandomValues(raw);
    const prepared = await prepareTransfer({ name: "r.bin", mime: "application/octet-stream", bytes: raw });
    const rx = new QftReceiver();
    rx.ingest(prepared.metaFrame);
    for (const frame of prepared.dataFrames) rx.ingest(frame);
    const out = await rx.reassemble();
    expect(bytesToHex(out.bytes.slice(0, 16))).toBe(bytesToHex(raw.slice(0, 16)));
    // Tamper with one stored chunk: checksum must fail.
    const rx2 = new QftReceiver();
    rx2.ingest(prepared.metaFrame);
    for (const frame of prepared.dataFrames) rx2.ingest(frame);
    const stored = (rx2 as unknown as { chunks: Map<number, Uint8Array> }).chunks.get(0);
    if (!stored) throw new Error("frame-missing");
    stored[0] = (stored[0] ?? 0) ^ 0xff;
    await expect(rx2.reassemble()).rejects.toThrow("checksum-mismatch");
  });

  it("crc and sha256 helpers behave", async () => {
    expect(crc16Ccitt("")).toBe(0xffff);
    expect(crc16Ccitt("a")).not.toBe(crc16Ccitt("b"));
    expect(await sha256Hex(bytes("abc"))).toHaveLength(64);
    expect(base64UrlToBytes(bytesToBase64Url(new Uint8Array([0, 255, 1])))).toEqual(new Uint8Array([0, 255, 1]));
    expect(base64UrlToBytes("!!!")).toBeNull();
  });
});

describe("qr-transfer encryption", () => {
  it("encrypts and decrypts with the right passphrase, fails without it", async () => {
    const prepared = await prepareTransfer({
      name: "secret.txt",
      mime: "text/plain",
      bytes: bytes("top secret bytes"),
      passphrase: "correct horse",
    });
    expect(prepared.meta.enc).toBe(1);
    const rx = new QftReceiver();
    rx.ingest(prepared.metaFrame);
    for (const frame of prepared.dataFrames) rx.ingest(frame);
    await expect(rx.reassemble()).rejects.toThrow("passphrase-required");
    await expect(rx.reassemble("wrong")).rejects.toThrow();
    const out = await rx.reassemble("correct horse");
    expect(new TextDecoder().decode(out.bytes)).toBe("top secret bytes");
  });
});
