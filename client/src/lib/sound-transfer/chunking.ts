/** Fixed-size chunking for the sound channel. */

import { SFT_DATA_BYTES } from "./types";

export function assertTransferableSize(size: number): void {
  if (!Number.isInteger(size) || size < 0) throw new Error("bad-size");
  if (size > 0xffffffff) throw new Error("too-large");
}

export function splitBytes(bytes: Uint8Array, chunkBytes = SFT_DATA_BYTES): Uint8Array[] {
  if (!Number.isInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > SFT_DATA_BYTES) {
    throw new Error("bad-chunk-size");
  }
  if (bytes.length === 0) return [];
  const out: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    out.push(bytes.slice(offset, offset + chunkBytes));
  }
  return out;
}

export function chunkCount(byteLength: number, chunkBytes = SFT_DATA_BYTES): number {
  if (!Number.isInteger(byteLength) || byteLength < 0) return 0;
  return Math.ceil(byteLength / chunkBytes);
}

export function joinChunks(chunks: (Uint8Array | null | undefined)[], total: number, expectedSize: number): Uint8Array {
  const out = new Uint8Array(expectedSize);
  let offset = 0;
  for (let i = 0; i < total; i += 1) {
    const part = chunks[i];
    if (!part) throw new Error(`missing-chunk-${i}`);
    if (offset + part.length > expectedSize) throw new Error("bad-chunk-size");
    out.set(part, offset);
    offset += part.length;
  }
  if (offset !== expectedSize) throw new Error("bad-wire-size");
  return out;
}
