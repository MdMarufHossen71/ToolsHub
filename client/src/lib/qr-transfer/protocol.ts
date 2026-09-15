/**
 * Versioned QR frame protocol.
 * Meta frame carries file description; data frames carry base64url payload chunks.
 * Every frame ends with a CRC-16 so a corrupted scan is rejected, never stored.
 */

import { crc16Ccitt } from "./integrity";
import { sanitizeMime } from "./filename";
import {
  QFT_MAX_CHUNKS,
  QFT_MAX_FILE_BYTES,
  QFT_MAX_FRAME_CHARS,
  QFT_MAX_MIME_CHARS,
  QFT_MAX_NAME_CHARS,
  QFT_MAX_PAYLOAD_CHARS,
  QFT_PROTOCOL_VERSION,
  type QftDataFrame,
  type QftDecodeError,
  type QftFrame,
  type QftMetaFrame,
  type QftTransferMeta,
} from "./types";

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9\-_]*$/.test(text)) return null;
  try {
    let b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function checksumOf(canonical: string): string {
  return crc16Ccitt(canonical).toString(16).padStart(4, "0");
}

export function isValidSessionId(sid: unknown): sid is string {
  return typeof sid === "string" && /^[0-9a-f]{16}$/.test(sid);
}

export function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function encodeMetaFrame(meta: QftTransferMeta): string {
  const canonical = JSON.stringify({
    v: QFT_PROTOCOL_VERSION,
    t: "meta",
    sid: meta.sid,
    name: meta.name,
    mime: meta.mime,
    size: meta.size,
    n: meta.n,
    chunk: meta.chunk,
    sha256: meta.sha256,
    enc: meta.enc,
    ...(meta.salt ? { salt: meta.salt } : {}),
    ...(meta.iv ? { iv: meta.iv } : {}),
  });
  return JSON.stringify({ ...JSON.parse(canonical), c: checksumOf(canonical) });
}

export function encodeDataFrame(sid: string, i: number, n: number, enc: 0 | 1, payload: string): string {
  const canonical = JSON.stringify({ v: QFT_PROTOCOL_VERSION, t: "data", sid, i, n, enc, p: payload });
  return JSON.stringify({ ...JSON.parse(canonical), c: checksumOf(canonical) });
}

type RawFrame = Record<string, unknown>;

function checkChecksum(obj: RawFrame): boolean {
  if (typeof obj.c !== "string") return false;
  const { c, ...rest } = obj;
  void c;
  const canonical = JSON.stringify(rest);
  return checksumOf(canonical) === obj.c;
}

function validMetaShape(obj: RawFrame): obj is RawFrame & {
  sid: string;
  name: string;
  mime: string;
  size: number;
  n: number;
  chunk: number;
  sha256: string;
  enc: number;
} {
  if (!isValidSessionId(obj.sid)) return false;
  if (typeof obj.name !== "string" || obj.name.length === 0 || obj.name.length > QFT_MAX_NAME_CHARS + 64) return false;
  if (typeof obj.mime !== "string" || obj.mime.length === 0 || obj.mime.length > QFT_MAX_MIME_CHARS + 32) return false;
  if (!Number.isInteger(obj.size) || (obj.size as number) < 0 || (obj.size as number) > QFT_MAX_FILE_BYTES) return false;
  if (!Number.isInteger(obj.n) || (obj.n as number) < 0 || (obj.n as number) > QFT_MAX_CHUNKS) return false;
  if (!Number.isInteger(obj.chunk) || (obj.chunk as number) < 1 || (obj.chunk as number) > 4096) return false;
  if (typeof obj.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(obj.sha256)) return false;
  if (obj.enc !== 0 && obj.enc !== 1) return false;
  if (obj.enc === 1 && (typeof obj.salt !== "string" || typeof obj.iv !== "string")) return false;
  return true;
}

export function decodeFrame(raw: string): { ok: true; frame: QftFrame } | { ok: false; error: QftDecodeError } {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > QFT_MAX_FRAME_CHARS) {
    return { ok: false, error: "too-long" };
  }
  let obj: RawFrame;
  try {
    obj = JSON.parse(raw) as RawFrame;
  } catch {
    return { ok: false, error: "bad-json" };
  }
  if (obj.v !== QFT_PROTOCOL_VERSION) return { ok: false, error: "bad-version" };
  if (obj.t !== "meta" && obj.t !== "data") return { ok: false, error: "bad-shape" };
  if (!checkChecksum(obj)) return { ok: false, error: "bad-checksum" };

  if (obj.t === "meta") {
    if (!validMetaShape(obj)) return { ok: false, error: "unsafe-limits" };
    const meta: QftTransferMeta = {
      v: QFT_PROTOCOL_VERSION,
      sid: obj.sid,
      name: String(obj.name).slice(0, QFT_MAX_NAME_CHARS + 64),
      mime: sanitizeMime(obj.mime),
      size: obj.size as number,
      n: obj.n as number,
      chunk: obj.chunk as number,
      sha256: obj.sha256 as string,
      enc: (obj.enc as number) === 1 ? 1 : 0,
      ...(typeof obj.salt === "string" ? { salt: obj.salt } : {}),
      ...(typeof obj.iv === "string" ? { iv: obj.iv } : {}),
    };
    const frame: QftMetaFrame = { kind: "meta", meta, raw };
    return { ok: true, frame };
  }

  // Data frame: strict index/total/payload validation before anything is stored.
  const { sid, i, n, enc, p } = obj as { sid: unknown; i: unknown; n: unknown; enc: unknown; p: unknown };
  if (!isValidSessionId(sid)) return { ok: false, error: "bad-shape" };
  if (!Number.isInteger(i) || !Number.isInteger(n)) return { ok: false, error: "bad-shape" };
  const index = i as number;
  const total = n as number;
  if (total < 0 || total > QFT_MAX_CHUNKS || index < 0 || index >= Math.max(total, 1)) {
    return { ok: false, error: "unsafe-limits" };
  }
  if (enc !== 0 && enc !== 1) return { ok: false, error: "bad-shape" };
  if (typeof p !== "string" || p.length > QFT_MAX_PAYLOAD_CHARS) return { ok: false, error: "unsafe-limits" };
  if (p.length > 0 && base64UrlToBytes(p) === null) return { ok: false, error: "bad-shape" };
  const frame: QftDataFrame = { kind: "data", sid, i: index, n: total, enc: enc === 1 ? 1 : 0, payload: p, raw };
  return { ok: true, frame };
}
