/** Shared types for the pure-optical QR file transfer engine. */

export const QFT_PROTOCOL_VERSION = 1;

/** Conservative default: reliability over density. Tunable internally. */
export const QFT_DEFAULT_CHUNK_BYTES = 800;
export const QFT_MIN_CHUNK_BYTES = 100;
export const QFT_MAX_CHUNK_BYTES = 2000;

/** Defensive caps: browsers have real memory limits, so reject absurd frames early. */
export const QFT_MAX_CHUNKS = 5000;
export const QFT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const QFT_MAX_FRAME_CHARS = 4000;
export const QFT_MAX_PAYLOAD_CHARS = 3200;
export const QFT_MAX_NAME_CHARS = 255;
export const QFT_MAX_MIME_CHARS = 127;

/** Default animation pacing: camera needs time to focus, decode and process. */
export const QFT_DEFAULT_FRAME_MS = 800;

export type QftTransferMeta = {
  v: number;
  sid: string;
  name: string;
  mime: string;
  size: number;
  n: number;
  chunk: number;
  sha256: string;
  enc: 0 | 1;
  salt?: string;
  iv?: string;
};

export type QftMetaFrame = {
  kind: "meta";
  meta: QftTransferMeta;
  raw: string;
};

export type QftDataFrame = {
  kind: "data";
  sid: string;
  i: number;
  n: number;
  enc: 0 | 1;
  payload: string;
  raw: string;
};

export type QftFrame = QftMetaFrame | QftDataFrame;

export type QftDecodeError =
  | "too-long"
  | "bad-json"
  | "bad-version"
  | "bad-shape"
  | "bad-checksum"
  | "unsafe-limits";

export type QftReceiverStatus =
  | "idle"
  | "receiving"
  | "verifying"
  | "complete"
  | "error";
