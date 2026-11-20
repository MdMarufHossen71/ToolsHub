/** Sender preparation: read once, optionally encrypt, hash, frame, estimate. */

import { assertTransferableSize, chunkCount, splitBytes } from "./chunking";
import { sequenceSeconds } from "./estimate";
import {
  encodeDataFrame,
  encodeMetaFrame,
  encodeMimeFrame,
  encodeNameFrame,
} from "./protocol";
import {
  SFT_DATA_BYTES,
  SFT_DEFAULT_GAP_MS,
  SFT_MAX_CHUNKS,
  SFT_MAX_FILE_BYTES,
  SFT_MAX_FRAMES,
  SFT_MAX_MIME_CHARS,
  SFT_MAX_NAME_BYTES,
  SFT_PROTOCOL_VERSION,
  type SftProtocol,
  type SftTransferMeta,
} from "./types";
import {
  createEncryptionEnvelope,
  encryptBytes,
  envelopeToMeta,
  sanitizeFilename,
  sanitizeMime,
  sha256Hex,
} from "../transfer/shared";

export type SftFrameKind = "meta" | "name" | "mime" | "data";

export type SftOutgoingFrame = {
  kind: SftFrameKind;
  /** Byte length is what the duration estimate uses. */
  payload: Uint8Array;
  /** Data chunk index for DATA frames; null for header frames. */
  dataIndex: number | null;
  label: string;
};

export type SftPreparedTransfer = {
  meta: SftTransferMeta;
  name: string;
  mime: string;
  plainSize: number;
  protocol: SftProtocol;
  gapMs: number;
  headerFrames: SftOutgoingFrame[];
  dataFrames: SftOutgoingFrame[];
  /** Full playback order, including repeated headers when requested. */
  frames: SftOutgoingFrame[];
  /** Index in `frames` where the first DATA frame starts. */
  dataStart: number;
  estimatedSeconds: number;
};

export function newSessionId(): number {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  // Zero is valid on the wire but a confusing label; remap it.
  return value === 0 ? 1 : value;
}

function normalizeProtocol(value: unknown): SftProtocol {
  return value === "normal" || value === "fast" || value === "fastest" ? value : "fastest";
}

export async function prepareTransfer(input: {
  name: string;
  mime: string;
  bytes: Uint8Array;
  passphrase?: string | undefined;
  protocol?: SftProtocol | undefined;
  gapMs?: number | undefined;
  repeatHeader?: boolean | undefined;
}): Promise<SftPreparedTransfer> {
  assertTransferableSize(input.bytes.length);
  if (input.bytes.length > SFT_MAX_FILE_BYTES) throw new Error("too-large");

  const name = sanitizeFilename(input.name);
  const mime = sanitizeMime(input.mime).slice(0, SFT_MAX_MIME_CHARS);
  const protocol = normalizeProtocol(input.protocol);
  const gapMs =
    typeof input.gapMs === "number" && Number.isFinite(input.gapMs)
      ? Math.min(5000, Math.max(300, Math.floor(input.gapMs)))
      : SFT_DEFAULT_GAP_MS;
  const repeatHeader = input.repeatHeader !== false;

  const nameBytes = new TextEncoder().encode(name);
  if (nameBytes.length > SFT_MAX_NAME_BYTES) throw new Error("name-too-long");

  const useEncryption = Boolean(input.passphrase);
  let wireBytes = input.bytes;
  let saltB64: string | undefined;
  let ivB64: string | undefined;
  if (useEncryption) {
    const { salt, iv } = await createEncryptionEnvelope();
    wireBytes = await encryptBytes(input.bytes, input.passphrase as string, salt, iv);
    ({ salt: saltB64, iv: ivB64 } = envelopeToMeta(salt, iv));
  }

  const total = chunkCount(wireBytes.length);
  if (total > SFT_MAX_CHUNKS) throw new Error("too-large");
  if (total > SFT_MAX_FRAMES) throw new Error("too-large");
  const sid = newSessionId();
  const sha256 = await sha256Hex(wireBytes);

  const meta: SftTransferMeta = {
    v: SFT_PROTOCOL_VERSION,
    sid,
    wireSize: wireBytes.length,
    total,
    sha256,
    enc: useEncryption ? 1 : 0,
    ...(saltB64 ? { salt: saltB64 } : {}),
    ...(ivB64 ? { iv: ivB64 } : {}),
  };

  const headerFrames: SftOutgoingFrame[] = [
    { kind: "meta", payload: encodeMetaFrame(meta), dataIndex: null, label: "M" },
  ];
  const nameParts = splitBytes(nameBytes);
  for (let i = 0; i < nameParts.length; i += 1) {
    const part = nameParts[i];
    if (!part) continue;
    headerFrames.push({
      kind: "name",
      payload: encodeNameFrame(sid, i, nameParts.length, part),
      dataIndex: null,
      label: `N${i + 1}/${nameParts.length}`,
    });
  }
  headerFrames.push({
    kind: "mime",
    payload: encodeMimeFrame(sid, mime),
    dataIndex: null,
    label: "T",
  });

  const dataFrames: SftOutgoingFrame[] = splitBytes(wireBytes).map((part, index) => ({
    kind: "data",
    payload: encodeDataFrame(sid, index, total, part),
    dataIndex: index,
    label: `D${index}`,
  }));

  const frames = repeatHeader
    ? [...headerFrames, ...headerFrames, ...dataFrames]
    : [...headerFrames, ...dataFrames];
  const dataStart = repeatHeader ? headerFrames.length * 2 : headerFrames.length;

  return {
    meta,
    name,
    mime,
    plainSize: input.bytes.length,
    protocol,
    gapMs,
    headerFrames,
    dataFrames,
    frames,
    dataStart,
    estimatedSeconds: sequenceSeconds(
      frames.map((frame) => frame.payload.length),
      protocol,
      gapMs,
    ),
  };
}

/**
 * Parse the replay box ("3, 7, 12-15") into zero-based data indices.
 *
 * The numbers are one-based because that is what the receiver shows and what a
 * person would type; the result is zero-based to match `dataFrames`.
 */
export function parseFrameList(text: string, total: number): number[] {
  const out = new Set<number>();
  if (!Number.isInteger(total) || total < 1) return [];
  const chunks = text.split(/[,\s]+/).filter(Boolean);
  for (const token of chunks) {
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const first = Number(range[1]);
      const second = Number(range[2]);
      if (!Number.isInteger(first) || !Number.isInteger(second)) continue;
      const from = Math.max(1, Math.min(first, second));
      const to = Math.min(total, Math.max(first, second));
      // A range that starts past the end is a typo, not "the last frame":
      // silently playing something the user did not ask for would waste time.
      if (from > total) continue;
      for (let i = from; i <= to; i += 1) out.add(i - 1);
      continue;
    }
    if (/^\d+$/.test(token)) {
      const frame = Number(token);
      if (Number.isInteger(frame) && frame >= 1 && frame <= total) out.add(frame - 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export const SOUND_FRAME_BYTES = SFT_DATA_BYTES;
