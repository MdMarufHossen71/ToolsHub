import { describe, expect, it } from "vitest";
import { SftReceiver } from "./receiver";
import { parseFrameList, prepareTransfer } from "./sender";
import { frameSeconds, sequenceSeconds } from "./estimate";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Header frames always come first: the receiver has no return channel, so a
 * DATA frame heard before META cannot be attributed to a session or verified.
 * DATA order is what varies here.
 */
async function receive(prepared: Awaited<ReturnType<typeof prepareTransfer>>, order: "forward" | "reverse" | "shuffle") {
  const rx = new SftReceiver();
  for (const frame of prepared.headerFrames) rx.ingest(frame.payload);
  const data = [...prepared.dataFrames];
  if (order === "reverse") data.reverse();
  if (order === "shuffle") {
    for (let i = data.length - 1; i > 0; i -= 1) {
      const j = (i * 7 + 3) % (i + 1);
      [data[i], data[j]] = [data[j] as (typeof data)[number], data[i] as (typeof data)[number]];
    }
  }
  for (const frame of data) rx.ingest(frame.payload);
  return rx;
}

describe("sound-transfer sender and receiver", () => {
  it("round-trips a small text file out of order", async () => {
    const prepared = await prepareTransfer({ name: "hello.txt", mime: "text/plain", bytes: bytes("hello sound") });
    const rx = await receive(prepared, "reverse");
    expect(rx.complete).toBe(true);
    expect(rx.name).toBe("hello.txt");
    const out = await rx.reassemble();
    expect(new TextDecoder().decode(out.bytes)).toBe("hello sound");
    expect(out.mime).toBe("text/plain");
    expect(out.sha256).toBe(prepared.meta.sha256);
  });

  it("round-trips binary data byte-for-byte and tolerates duplicates", async () => {
    const raw = new Uint8Array(1000);
    crypto.getRandomValues(raw);
    const prepared = await prepareTransfer({ name: "blob.bin", mime: "application/octet-stream", bytes: raw });
    const rx = new SftReceiver();
    for (const frame of prepared.frames) rx.ingest(frame.payload);
    // Repeating the whole sequence must not change the bytes.
    for (const frame of prepared.frames) rx.ingest(frame.payload);
    expect(rx.complete).toBe(true);
    expect(rx.duplicates).toBe(prepared.dataFrames.length);
    const out = await rx.reassemble();
    expect(out.bytes).toEqual(raw);
  });

  it("supports empty files", async () => {
    const prepared = await prepareTransfer({ name: "empty.txt", mime: "text/plain", bytes: new Uint8Array(0) });
    expect(prepared.meta.total).toBe(0);
    expect(prepared.dataFrames).toHaveLength(0);
    const rx = await receive(prepared, "forward");
    expect(rx.complete).toBe(true);
    const out = await rx.reassemble();
    expect(out.bytes).toHaveLength(0);
    expect(out.name).toBe("empty.txt");
  });

  it("keeps Unicode filenames intact across name parts", async () => {
    const name = "ছবি-২০২৬-🚀.png";
    const prepared = await prepareTransfer({ name, mime: "image/png", bytes: bytes("x") });
    const rx = await receive(prepared, "shuffle");
    expect(rx.complete).toBe(true);
    expect(rx.name).toBe(name);
  });

  it("encrypts the whole payload and verifies before decrypting", async () => {
    const raw = bytes("secret payload");
    const prepared = await prepareTransfer({
      name: "secret.txt",
      mime: "text/plain",
      bytes: raw,
      passphrase: "correct horse",
    });
    expect(prepared.meta.enc).toBe(1);
    expect(prepared.meta.wireSize).toBe(raw.length + 16);
    const rx = await receive(prepared, "reverse");
    expect(rx.complete).toBe(true);
    await expect(rx.reassemble()).rejects.toThrow("passphrase-required");
    await expect(rx.reassemble("wrong")).rejects.toThrow("wrong-passphrase");
    const out = await rx.reassemble("correct horse");
    expect(out.bytes).toEqual(raw);
  });

  it("never emits a payload larger than ggwave's limit", async () => {
    const prepared = await prepareTransfer({
      name: "x.bin",
      mime: "application/octet-stream",
      bytes: new Uint8Array(2000),
      protocol: "fast",
    });
    for (const frame of prepared.frames) expect(frame.payload.length).toBeLessThanOrEqual(140);
    expect(prepared.meta.total).toBe(Math.ceil(2000 / 123));
    expect(prepared.dataStart).toBe(prepared.headerFrames.length * 2);
  });

  it("estimates fastest as quicker than normal", () => {
    const sizes = [54, 4, 123, 123, 123];
    const fastest = sequenceSeconds(sizes, "fastest");
    const fast = sequenceSeconds(sizes, "fast");
    const normal = sequenceSeconds(sizes, "normal");
    expect(fastest).toBeLessThan(fast);
    expect(fast).toBeLessThan(normal);
    expect(frameSeconds(123, "fastest")).toBeGreaterThan(4);
    expect(frameSeconds(123, "fastest")).toBeLessThan(6);
  });

  it("parses a manual replay list", () => {
    // One-based input, zero-based indices.
    expect(parseFrameList("3, 7, 12-15", 20)).toEqual([2, 6, 11, 12, 13, 14]);
    expect(parseFrameList("1,1,2", 5)).toEqual([0, 1]);
    expect(parseFrameList("2-99", 5)).toEqual([1, 2, 3, 4]);
    expect(parseFrameList("9-99", 5)).toEqual([]);
    expect(parseFrameList("15-12", 20)).toEqual([11, 12, 13, 14]);
    expect(parseFrameList("nope", 5)).toEqual([]);
  });

  it("offers to switch when a different session starts", async () => {
    const first = await prepareTransfer({ name: "one.txt", mime: "text/plain", bytes: bytes("one") });
    const second = await prepareTransfer({ name: "two.txt", mime: "text/plain", bytes: bytes("two") });
    const rx = new SftReceiver();
    rx.ingest(first.frames[0]?.payload as Uint8Array);
    const foreign = rx.ingest(second.frames[0]?.payload as Uint8Array);
    expect(foreign.kind).toBe("wrong-session");
    expect(rx.pendingMeta?.sid).toBe(second.meta.sid);
    rx.acceptPending();
    expect(rx.meta?.sid).toBe(second.meta.sid);
    for (const frame of second.frames) rx.ingest(frame.payload);
    const out = await rx.reassemble();
    expect(new TextDecoder().decode(out.bytes)).toBe("two");
  });

  it("ignores DATA heard before the header block", async () => {
    const prepared = await prepareTransfer({ name: "late.txt", mime: "text/plain", bytes: bytes("late") });
    const rx = new SftReceiver();
    for (const frame of prepared.dataFrames) {
      expect(rx.ingest(frame.payload).kind).toBe("invalid");
    }
    expect(rx.meta).toBeNull();
    for (const frame of prepared.frames) rx.ingest(frame.payload);
    expect(await rx.reassemble()).toBeTruthy();
  });
});
