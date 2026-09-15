/** File chunking: one ArrayBuffer read, then cheap Uint8Array views per chunk. */

import {
  QFT_DEFAULT_CHUNK_BYTES,
  QFT_MAX_CHUNK_BYTES,
  QFT_MAX_FILE_BYTES,
  QFT_MIN_CHUNK_BYTES,
} from "./types";

export function normalizeChunkBytes(requested: unknown): number {
  const n = typeof requested === "number" ? Math.floor(requested) : parseInt(String(requested ?? ""), 10);
  if (!Number.isFinite(n)) return QFT_DEFAULT_CHUNK_BYTES;
  return Math.min(QFT_MAX_CHUNK_BYTES, Math.max(QFT_MIN_CHUNK_BYTES, n));
}

export function assertTransferableSize(size: number): void {
  if (!Number.isInteger(size) || size < 0) throw new Error("bad-size");
  if (size > QFT_MAX_FILE_BYTES) throw new Error("too-large");
}

export function splitBytes(bytes: Uint8Array, chunkBytes: number): Uint8Array[] {
  const size = normalizeChunkBytes(chunkBytes);
  if (bytes.length === 0) return [];
  const out: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += size) {
    out.push(bytes.slice(offset, offset + size));
  }
  return out;
}

export function joinChunks(chunks: (Uint8Array | null | undefined)[], total: number, expectedSize: number): Uint8Array {
  const out = new Uint8Array(expectedSize);
  let offset = 0;
  for (let i = 0; i < total; i += 1) {
    const part = chunks[i];
    if (!part) throw new Error(`missing-chunk-${i}`);
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function countFrames(byteLength: number, chunkBytes: number): number {
  if (byteLength === 0) return 0;
  return Math.ceil(byteLength / normalizeChunkBytes(chunkBytes));
}
