/**
 * Receiver store for the sound channel: out-of-order and duplicate tolerant,
 * session isolated, with an explicit pending-session switch because there is no
 * return channel to ask the sender to restart.
 */

import { joinChunks } from "./chunking";
import { decodeFrame } from "./protocol";
import {
  SFT_DATA_BYTES,
  SFT_MAX_NAME_BYTES,
  type SftTransferMeta,
} from "./types";
import {
  base64UrlToBytes,
  decryptBytes,
  hexEqual,
  sanitizeFilename,
  sanitizeMime,
  sha256Hex,
} from "../transfer/shared";

export type SftIngest =
  | { kind: "meta"; meta: SftTransferMeta }
  | { kind: "name"; received: number; total: number }
  | { kind: "mime" }
  | { kind: "stored"; index: number }
  | { kind: "duplicate" }
  | { kind: "wrong-session"; sid: number; meta: SftTransferMeta | null }
  | { kind: "invalid"; error: string };

export class SftReceiver {
  meta: SftTransferMeta | null = null;
  /** A valid META from a different session, waiting for the user to switch. */
  pendingMeta: SftTransferMeta | null = null;

  private pendingMetaPayload: Uint8Array | null = null;
  private chunks = new Map<number, Uint8Array>();
  private nameParts = new Map<number, Uint8Array>();
  private nameTotal = 0;
  private nameBytes = 0;
  private mimeValue: string | null = null;
  private receivedBytesValue = 0;

  duplicates = 0;
  invalid = 0;
  wrongSession = 0;

  get total(): number {
    return this.meta?.total ?? 0;
  }

  get received(): number {
    return this.chunks.size;
  }

  get receivedBytes(): number {
    return this.receivedBytesValue;
  }

  get totalBytes(): number {
    return this.meta?.wireSize ?? 0;
  }

  get mime(): string {
    return sanitizeMime(this.mimeValue ?? "application/octet-stream");
  }

  get nameComplete(): boolean {
    return this.nameTotal > 0 && this.nameParts.size === this.nameTotal;
  }

  get name(): string | null {
    if (!this.nameComplete) return null;
    const bytes = new Uint8Array(this.nameBytes);
    let offset = 0;
    for (let i = 0; i < this.nameTotal; i += 1) {
      const part = this.nameParts.get(i);
      if (!part) return null;
      bytes.set(part, offset);
      offset += part.length;
    }
    return sanitizeFilename(new TextDecoder().decode(bytes.subarray(0, offset)));
  }

  get dataComplete(): boolean {
    return this.meta !== null && (this.meta.total === 0 || this.chunks.size === this.meta.total);
  }

  /**
   * Data completeness is what blocks the download. A missing NAME frame only
   * costs the original filename (we fall back to `download.bin`), so it must
   * not make a fully received file unrecoverable.
   */
  get complete(): boolean {
    if (!this.meta) return false;
    // An empty file has no DATA frames, so the NAME frame is its only payload:
    // waiting for it avoids offering a nameless download before it arrives.
    return this.meta.total === 0 ? this.nameComplete : this.dataComplete;
  }

  missing(): number[] {
    if (!this.meta) return [];
    const out: number[] = [];
    for (let i = 0; i < this.meta.total; i += 1) {
      if (!this.chunks.has(i)) out.push(i);
    }
    return out;
  }

  reset(): void {
    this.meta = null;
    this.pendingMeta = null;
    this.pendingMetaPayload = null;
    this.chunks.clear();
    this.nameParts.clear();
    this.nameTotal = 0;
    this.nameBytes = 0;
    this.mimeValue = null;
    this.receivedBytesValue = 0;
    this.duplicates = 0;
    this.invalid = 0;
    this.wrongSession = 0;
  }

  /** Ignore the pending META; the current transmission stays selected. */
  dismissPending(): void {
    this.pendingMeta = null;
    this.pendingMetaPayload = null;
  }

  /** Switch to the pending transmission, discarding the current one. */
  acceptPending(): SftIngest | null {
    const payload = this.pendingMetaPayload;
    if (!payload) return null;
    this.reset();
    return this.ingest(payload);
  }

  ingest(payload: Uint8Array): SftIngest {
    const decoded = decodeFrame(payload);
    if (!decoded.ok) {
      this.invalid += 1;
      return { kind: "invalid", error: decoded.error };
    }
    const frame = decoded.frame;

    if (!this.meta) {
      if (frame.kind !== "meta") {
        this.invalid += 1;
        return { kind: "invalid", error: "no-meta" };
      }
      this.meta = { ...frame.meta };
      this.pendingMeta = null;
      this.pendingMetaPayload = null;
      // Counters describe this session; audio heard before its header is not
      // the user's problem and would otherwise dwarf the real numbers.
      this.duplicates = 0;
      this.invalid = 0;
      this.wrongSession = 0;
      return { kind: "meta", meta: this.meta };
    }

    if (frame.sid !== this.meta.sid) {
      this.wrongSession += 1;
      if (frame.kind === "meta") {
        this.pendingMeta = { ...frame.meta };
        this.pendingMetaPayload = payload.slice();
        return { kind: "wrong-session", sid: frame.sid, meta: frame.meta };
      }
      return { kind: "wrong-session", sid: frame.sid, meta: null };
    }

    if (frame.kind === "meta") {
      return { kind: "meta", meta: this.meta };
    }

    if (frame.kind === "name") {
      if (this.nameTotal === 0) {
        this.nameTotal = frame.total;
      } else if (this.nameTotal !== frame.total) {
        this.invalid += 1;
        return { kind: "invalid", error: "bad-name-total" };
      }
      if (this.nameParts.has(frame.index)) {
        return { kind: "name", received: this.nameParts.size, total: this.nameTotal };
      }
      if (this.nameBytes + frame.bytes.length > SFT_MAX_NAME_BYTES) {
        this.invalid += 1;
        return { kind: "invalid", error: "name-too-long" };
      }
      this.nameParts.set(frame.index, frame.bytes);
      this.nameBytes += frame.bytes.length;
      return { kind: "name", received: this.nameParts.size, total: this.nameTotal };
    }

    if (frame.kind === "mime") {
      if (this.mimeValue === null) this.mimeValue = frame.mime;
      return { kind: "mime" };
    }

    // DATA
    if (frame.total !== this.meta.total) {
      this.invalid += 1;
      return { kind: "invalid", error: "bad-total" };
    }
    if (frame.bytes.length > SFT_DATA_BYTES) {
      this.invalid += 1;
      return { kind: "invalid", error: "bad-chunk-size" };
    }
    if (this.chunks.has(frame.index)) {
      this.duplicates += 1;
      return { kind: "duplicate" };
    }
    this.chunks.set(frame.index, frame.bytes);
    this.receivedBytesValue += frame.bytes.length;
    return { kind: "stored", index: frame.index };
  }

  async reassemble(passphrase?: string): Promise<{
    bytes: Uint8Array;
    name: string;
    mime: string;
    sha256: string;
    wireSize: number;
  }> {
    if (!this.meta) throw new Error("no-meta");
    if (!this.dataComplete) throw new Error("incomplete");

    const ordered: Uint8Array[] = [];
    for (let i = 0; i < this.meta.total; i += 1) {
      const part = this.chunks.get(i);
      if (!part) throw new Error(`missing-chunk-${i}`);
      ordered.push(part);
    }
    const wire = this.meta.total === 0 ? new Uint8Array(0) : joinChunks(ordered, this.meta.total, this.meta.wireSize);

    // The hash covers what was actually received: ciphertext for encrypted
    // transfers, plaintext otherwise. Verify before asking for a passphrase.
    const actual = await sha256Hex(wire);
    if (!hexEqual(actual, this.meta.sha256)) throw new Error("checksum-mismatch");

    let bytes = wire;
    if (this.meta.enc === 1) {
      if (!passphrase) throw new Error("passphrase-required");
      if (!this.meta.salt || !this.meta.iv) throw new Error("bad-envelope");
      const salt = base64UrlToBytes(this.meta.salt);
      const iv = base64UrlToBytes(this.meta.iv);
      if (!salt || !iv) throw new Error("bad-envelope");
      bytes = await decryptBytes(wire, passphrase, salt, iv);
    }

    return {
      bytes,
      name: (this.nameComplete ? this.name : null) ?? "download.bin",
      mime: this.mime,
      sha256: actual,
      wireSize: wire.length,
    };
  }
}
