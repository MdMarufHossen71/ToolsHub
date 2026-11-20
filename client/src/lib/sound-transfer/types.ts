/** Shared types and hard limits for the sound-only file channel. */

export const SFT_PROTOCOL_VERSION = 1;

/** ggwave 0.4.0 accepts at most 140 bytes in one transmission. */
export const SFT_MAX_PAYLOAD_BYTES = 140;

/** magic(2) + version/type(1) + session(4) + index(3) + total(3) */
export const SFT_HEADER_BYTES = 15;
export const SFT_CRC_BYTES = 2;
/** 140 - 15 - 2 = 123 bytes of body per frame. */
export const SFT_DATA_BYTES = SFT_MAX_PAYLOAD_BYTES - SFT_HEADER_BYTES - SFT_CRC_BYTES;

export const SFT_MAGIC_0 = 0x53; // "S"
export const SFT_MAGIC_1 = 0x54; // "T"

export const SFT_TYPE_META = 1;
export const SFT_TYPE_NAME = 2;
export const SFT_TYPE_MIME = 3;
export const SFT_TYPE_DATA = 4;

/** The header's index/total fields are uint24. */
export const SFT_MAX_CHUNKS = 0xffffff;
/**
 * Internal safety bound only. There is deliberately no user-facing file cap:
 * the tool shows an estimate and warns when a transfer is impractical.
 */
export const SFT_MAX_FILE_BYTES = SFT_MAX_CHUNKS * SFT_DATA_BYTES - 16;

/**
 * Memory guard, not a product limit: 250k frames is roughly 30 MB of payload
 * and a fortnight of continuous sound at the fastest protocol. Refusing beyond
 * this keeps a stray multi-gigabyte pick from exhausting the tab.
 */
export const SFT_MAX_FRAMES = 250_000;

export const SFT_MAX_NAME_BYTES = 1024;
export const SFT_MAX_NAME_PARTS = 9;
export const SFT_MAX_MIME_CHARS = 123;

/** ggwave's own waveform volume is 0-100. 80 leaves headroom for playback gain. */
export const SFT_VOLUME = 80;
/**
 * Silence between frames. The receiver finalises a burst after 0.7 s of quiet
 * and then waits 0.15 s before listening again, so the gap must exceed 0.85 s;
 * 1.2 s leaves margin for speaker and microphone latency.
 */
export const SFT_DEFAULT_GAP_MS = 1200;

export type SftProtocol = "normal" | "fast" | "fastest";

export type SftTransferMeta = {
  v: number;
  sid: number;
  /** Ciphertext length when encrypted; plaintext length otherwise. */
  wireSize: number;
  /** Number of data frames (uint24). */
  total: number;
  /** SHA-256 of the wire bytes, lowercase hex. */
  sha256: string;
  enc: 0 | 1;
  salt?: string;
  iv?: string;
};

export type SftMetaFrame = {
  kind: "meta";
  sid: number;
  total: number;
  meta: SftTransferMeta;
};

export type SftNameFrame = {
  kind: "name";
  sid: number;
  index: number;
  total: number;
  bytes: Uint8Array;
};

export type SftMimeFrame = {
  kind: "mime";
  sid: number;
  mime: string;
};

export type SftDataFrame = {
  kind: "data";
  sid: number;
  index: number;
  total: number;
  bytes: Uint8Array;
};

export type SftFrame = SftMetaFrame | SftNameFrame | SftMimeFrame | SftDataFrame;

export type SftDecodeError =
  | "too-short"
  | "too-long"
  | "bad-magic"
  | "bad-version"
  | "bad-type"
  | "bad-crc"
  | "bad-shape"
  | "unsafe-limits";
