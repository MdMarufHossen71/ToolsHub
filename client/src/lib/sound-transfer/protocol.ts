/**
 * Versioned binary frame protocol for the sound channel.
 *
 * ggwave gives us at most 140 bytes per transmission and no return channel, so
 * every byte matters: envelopes are packed binary, not JSON/base64. A frame is
 *
 *   magic(2) | version/type(1) | session(4) | index(3) | total(3) | body | crc16(2)
 *
 * All integers are big-endian. `total` is the number of DATA frames for META
 * and DATA, and the number of parts for NAME (1 for MIME).
 */

import {
  SFT_CRC_BYTES,
  SFT_DATA_BYTES,
  SFT_HEADER_BYTES,
  SFT_MAGIC_0,
  SFT_MAGIC_1,
  SFT_MAX_CHUNKS,
  SFT_MAX_FRAMES,
  SFT_MAX_MIME_CHARS,
  SFT_MAX_NAME_PARTS,
  SFT_MAX_PAYLOAD_BYTES,
  SFT_PROTOCOL_VERSION,
  SFT_TYPE_DATA,
  SFT_TYPE_META,
  SFT_TYPE_MIME,
  SFT_TYPE_NAME,
  type SftDecodeError,
  type SftFrame,
  type SftTransferMeta,
} from "./types";
import { base64UrlToBytes, bytesToBase64Url, bytesToHex, crc16CcittBytes } from "../transfer/shared";

const utf8 = new TextEncoder();

/* ------------------------------------------------------------------ */
/* integer helpers                                                     */
/* ------------------------------------------------------------------ */

function writeUint24(view: DataView, offset: number, value: number): void {
  view.setUint8(offset, (value >>> 16) & 0xff);
  view.setUint8(offset + 1, (value >>> 8) & 0xff);
  view.setUint8(offset + 2, value & 0xff);
}

function readUint24(view: DataView, offset: number): number {
  return (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2);
}

function bodyView(frame: Uint8Array): DataView {
  return new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
}

/* ------------------------------------------------------------------ */
/* encoding                                                            */
/* ------------------------------------------------------------------ */

export function encodeFrame(
  type: number,
  sid: number,
  index: number,
  total: number,
  body: Uint8Array,
): Uint8Array {
  if (!Number.isInteger(sid) || sid < 0 || sid > 0xffffffff) throw new Error("bad-session");
  if (!Number.isInteger(index) || index < 0 || index > SFT_MAX_CHUNKS) throw new Error("bad-index");
  if (!Number.isInteger(total) || total < 0 || total > SFT_MAX_CHUNKS) throw new Error("bad-total");
  if (body.length > SFT_DATA_BYTES) throw new Error("body-too-long");

  const frame = new Uint8Array(SFT_HEADER_BYTES + body.length + SFT_CRC_BYTES);
  const view = new DataView(frame.buffer);
  frame[0] = SFT_MAGIC_0;
  frame[1] = SFT_MAGIC_1;
  frame[2] = ((SFT_PROTOCOL_VERSION & 0x0f) << 4) | (type & 0x0f);
  view.setUint32(3, sid, false);
  writeUint24(view, 7, index);
  writeUint24(view, 10, total);
  frame.set(body, SFT_HEADER_BYTES);
  const crc = crc16CcittBytes(frame.subarray(0, frame.length - SFT_CRC_BYTES));
  view.setUint16(frame.length - SFT_CRC_BYTES, crc, false);
  if (frame.length > SFT_MAX_PAYLOAD_BYTES) throw new Error("frame-too-long");
  return frame;
}

export function encodeMetaFrame(meta: SftTransferMeta): Uint8Array {
  const body = new Uint8Array(4 + 32 + 1 + (meta.enc ? 16 + 12 : 0));
  const view = new DataView(body.buffer);
  view.setUint32(0, meta.wireSize, false);
  const hash = hexToBytes(meta.sha256);
  if (!hash) throw new Error("bad-hash");
  body.set(hash, 4);
  body[36] = meta.enc;
  if (meta.enc) {
    const salt = meta.salt ? base64UrlToBytes(meta.salt) : null;
    const iv = meta.iv ? base64UrlToBytes(meta.iv) : null;
    if (!salt || salt.length !== 16 || !iv || iv.length !== 12) throw new Error("bad-envelope");
    body.set(salt, 37);
    body.set(iv, 53);
  }
  return encodeFrame(SFT_TYPE_META, meta.sid, 0, meta.total, body);
}

export function encodeNameFrame(sid: number, index: number, total: number, bytes: Uint8Array): Uint8Array {
  if (bytes.length === 0 || bytes.length > SFT_DATA_BYTES) throw new Error("bad-name");
  return encodeFrame(SFT_TYPE_NAME, sid, index, total, bytes);
}

export function encodeMimeFrame(sid: number, mime: string): Uint8Array {
  const bytes = utf8.encode(mime.slice(0, SFT_MAX_MIME_CHARS));
  if (bytes.length === 0 || bytes.length > SFT_DATA_BYTES) throw new Error("bad-mime");
  return encodeFrame(SFT_TYPE_MIME, sid, 0, 1, bytes);
}

export function encodeDataFrame(sid: number, index: number, total: number, bytes: Uint8Array): Uint8Array {
  if (bytes.length === 0 || bytes.length > SFT_DATA_BYTES) throw new Error("bad-data");
  if (index < 0 || index >= total) throw new Error("bad-index");
  return encodeFrame(SFT_TYPE_DATA, sid, index, total, bytes);
}

/* ------------------------------------------------------------------ */
/* decoding                                                            */
/* ------------------------------------------------------------------ */

function ok(frame: SftFrame): { ok: true; frame: SftFrame } {
  return { ok: true, frame };
}

function fail(error: SftDecodeError): { ok: false; error: SftDecodeError } {
  return { ok: false, error };
}

export function decodeFrame(payload: Uint8Array): { ok: true; frame: SftFrame } | { ok: false; error: SftDecodeError } {
  if (payload.length < SFT_HEADER_BYTES + 1 + SFT_CRC_BYTES) return fail("too-short");
  if (payload.length > SFT_MAX_PAYLOAD_BYTES) return fail("too-long");
  if (payload[0] !== SFT_MAGIC_0 || payload[1] !== SFT_MAGIC_1) return fail("bad-magic");

  const view = bodyView(payload);
  const version = (payload[2] ?? 0) >> 4;
  const type = (payload[2] ?? 0) & 0x0f;
  if (version !== SFT_PROTOCOL_VERSION) return fail("bad-version");
  if (type !== SFT_TYPE_META && type !== SFT_TYPE_NAME && type !== SFT_TYPE_MIME && type !== SFT_TYPE_DATA) {
    return fail("bad-type");
  }

  const expectedCrc = crc16CcittBytes(payload.subarray(0, payload.length - SFT_CRC_BYTES));
  if (view.getUint16(payload.length - SFT_CRC_BYTES, false) !== expectedCrc) return fail("bad-crc");

  const sid = view.getUint32(3, false);
  const index = readUint24(view, 7);
  const total = readUint24(view, 10);
  const body = payload.subarray(SFT_HEADER_BYTES, payload.length - SFT_CRC_BYTES);

  if (type === SFT_TYPE_META) {
    if (body.length !== 37 && body.length !== 65) return fail("bad-shape");
    if (index !== 0) return fail("bad-shape");
    // A hostile header must not make `missing()` scan millions of indexes.
    if (total > SFT_MAX_CHUNKS || total > SFT_MAX_FRAMES) return fail("unsafe-limits");
    const bodyData = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const wireSize = bodyData.getUint32(0, false);
    const hash = bytesToHex(body.subarray(4, 36));
    const flags = body[36] ?? 0;
    if (flags !== 0 && flags !== 1) return fail("bad-shape");
    const enc = flags as 0 | 1;
    if (enc === 0 && body.length !== 37) return fail("bad-shape");
    if (enc === 1 && body.length !== 65) return fail("bad-shape");
    if (total !== Math.ceil(wireSize / SFT_DATA_BYTES)) return fail("bad-shape");
    if (total > 0 && wireSize === 0) return fail("bad-shape");
    if (total === 0 && wireSize !== 0) return fail("bad-shape");
    let salt: string | undefined;
    let iv: string | undefined;
    if (enc === 1) {
      salt = bytesToBase64Url(body.subarray(37, 53));
      iv = bytesToBase64Url(body.subarray(53, 65));
    }
    const meta: SftTransferMeta = {
      v: SFT_PROTOCOL_VERSION,
      sid,
      wireSize,
      total,
      sha256: hash,
      enc,
      ...(salt ? { salt } : {}),
      ...(iv ? { iv } : {}),
    };
    return ok({ kind: "meta", sid, total, meta });
  }

  if (type === SFT_TYPE_NAME) {
    if (total < 1 || total > SFT_MAX_NAME_PARTS) return fail("unsafe-limits");
    if (index >= total) return fail("bad-shape");
    if (body.length === 0 || body.length > SFT_DATA_BYTES) return fail("bad-shape");
    return ok({ kind: "name", sid, index, total, bytes: body.slice() });
  }

  if (type === SFT_TYPE_MIME) {
    if (index !== 0 || total !== 1) return fail("bad-shape");
    if (body.length === 0 || body.length > SFT_MAX_MIME_CHARS) return fail("bad-shape");
    let mime: string;
    try {
      mime = new TextDecoder("utf-8", { fatal: true }).decode(body);
    } catch {
      return fail("bad-shape");
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(mime)) return fail("bad-shape");
    return ok({ kind: "mime", sid, mime });
  }

  if (total < 1 || total > SFT_MAX_CHUNKS) return fail("unsafe-limits");
  if (index >= total) return fail("bad-shape");
  if (body.length === 0 || body.length > SFT_DATA_BYTES) return fail("bad-shape");
  return ok({ kind: "data", sid, index, total, bytes: body.slice() });
}

/* ------------------------------------------------------------------ */
/* small local codecs                                                  */
/* ------------------------------------------------------------------ */

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Used by the UI and tests; keeps the session id in one display format. */
export function sessionLabel(sid: number): string {
  return sid.toString(16).padStart(8, "0");
}
