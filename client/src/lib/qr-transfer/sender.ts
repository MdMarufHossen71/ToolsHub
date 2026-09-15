/** Sender preparation: read once, optionally encrypt, split, hash, frame. */

import { normalizeChunkBytes, assertTransferableSize, splitBytes } from "./chunking";
import { createEncryptionEnvelope, encryptBytes, envelopeToMeta } from "./crypto";
import { sha256Hex } from "./integrity";
import { bytesToBase64Url, encodeDataFrame, encodeMetaFrame, newSessionId } from "./protocol";
import { QFT_DEFAULT_FRAME_MS, type QftTransferMeta } from "./types";

export type PreparedTransfer = {
  meta: QftTransferMeta;
  metaFrame: string;
  dataFrames: string[];
  /** Raw payload bytes (ciphertext when encrypted) kept for potential re-chunking. */
  payloadBytes: Uint8Array;
  frameMs: number;
};

export async function prepareTransfer(input: {
  name: string;
  mime: string;
  bytes: Uint8Array;
  chunkBytes?: number;
  passphrase?: string | undefined;
  frameMs?: number;
}): Promise<PreparedTransfer> {
  assertTransferableSize(input.bytes.length);
  const chunk = normalizeChunkBytes(input.chunkBytes ?? 800);
  const sid = newSessionId();
  const useEncryption = Boolean(input.passphrase);

  let payloadBytes = input.bytes;
  let saltB64: string | undefined;
  let ivB64: string | undefined;
  if (useEncryption) {
    const { salt, iv } = await createEncryptionEnvelope();
    payloadBytes = await encryptBytes(input.bytes, input.passphrase as string, salt, iv);
    assertTransferableSize(payloadBytes.length + 16);
    ({ salt: saltB64, iv: ivB64 } = envelopeToMeta(salt, iv));
  }

  const chunks = input.bytes.length === 0 ? [] : splitBytes(useEncryption ? payloadBytes : input.bytes, chunk);
  // For encrypted transfers the hash covers ciphertext: receiver verifies what
  // it scanned, then decrypts. Plaintext hash would leak nothing extra but
  // cannot be checked before decryption, so ciphertext hash is the honest one.
  const hashSource = useEncryption ? payloadBytes : input.bytes;
  const sha256 = await sha256Hex(hashSource);

  const meta: QftTransferMeta = {
    v: 1,
    sid,
    name: input.name.slice(0, 255) || "download.bin",
    mime: input.mime || "application/octet-stream",
    size: useEncryption ? payloadBytes.length : input.bytes.length,
    n: chunks.length,
    chunk,
    sha256,
    enc: useEncryption ? 1 : 0,
    ...(saltB64 ? { salt: saltB64 } : {}),
    ...(ivB64 ? { iv: ivB64 } : {}),
  };

  const dataFrames = chunks.map((part, i) => encodeDataFrame(sid, i, chunks.length, meta.enc, bytesToBase64Url(part)));

  return {
    meta,
    metaFrame: encodeMetaFrame(meta),
    dataFrames,
    payloadBytes,
    frameMs:
      typeof input.frameMs === "number" && Number.isFinite(input.frameMs)
        ? Math.min(5000, Math.max(300, Math.floor(input.frameMs)))
        : QFT_DEFAULT_FRAME_MS,
  };
}

/** Full on-screen sequence: metadata first, then data frames in order. */
export function senderSequence(prepared: PreparedTransfer): string[] {
  return [prepared.metaFrame, ...prepared.dataFrames];
}
