/**
 * Receiver store: out-of-order tolerant, duplicate tolerant, session isolated.
 * Chunks are keyed by index; completion requires every index 0..n-1 exactly once.
 */

import { base64UrlToBytes, decodeFrame } from "./protocol";
import { decryptBytes } from "./crypto";
import { hexEqual, sha256Hex } from "./integrity";
import { joinChunks } from "./chunking";
import { sanitizeFilename, sanitizeMime } from "./filename";
import type { QftTransferMeta } from "./types";

export type ReceiverIngest =
  | { kind: "meta"; meta: QftTransferMeta }
  | { kind: "stored"; index: number }
  | { kind: "duplicate" }
  | { kind: "wrong-session"; sid: string }
  | { kind: "invalid"; error: string };

export class QftReceiver {
  meta: QftTransferMeta | null = null;
  private chunks = new Map<number, Uint8Array>();
  duplicates = 0;
  invalid = 0;
  wrongSession = 0;

  get total(): number {
    return this.meta?.n ?? 0;
  }

  get received(): number {
    return this.chunks.size;
  }

  get complete(): boolean {
    return this.meta !== null && this.chunks.size === this.meta.n;
  }

  missing(): number[] {
    if (!this.meta) return [];
    const out: number[] = [];
    for (let i = 0; i < this.meta.n; i += 1) {
      if (!this.chunks.has(i)) out.push(i);
    }
    return out;
  }

  reset(): void {
    this.meta = null;
    this.chunks.clear();
    this.duplicates = 0;
    this.invalid = 0;
    this.wrongSession = 0;
  }

  ingest(raw: string): ReceiverIngest {
    const decoded = decodeFrame(raw);
    if (!decoded.ok) {
      this.invalid += 1;
      return { kind: "invalid", error: decoded.error };
    }
    const { frame } = decoded;

    if (frame.kind === "meta") {
      // First meta wins and locks the session; a second session never merges.
      if (this.meta && this.meta.sid !== frame.meta.sid) {
        this.wrongSession += 1;
        return { kind: "wrong-session", sid: frame.meta.sid };
      }
      if (!this.meta) {
        // Empty file: n==0 completes on metadata alone.
        this.meta = { ...frame.meta, name: frame.meta.name, mime: sanitizeMime(frame.meta.mime) };
        this.chunks.clear();
      }
      return { kind: "meta", meta: this.meta };
    }

    // Data before metadata is buffered only if it looks sane; once meta locks,
    // any foreign session is counted separately and ignored.
    if (this.meta && frame.sid !== this.meta.sid) {
      this.wrongSession += 1;
      return { kind: "wrong-session", sid: frame.sid };
    }
    if (this.meta && frame.n !== this.meta.n) {
      this.invalid += 1;
      return { kind: "invalid", error: "bad-shape" };
    }
    if (this.chunks.has(frame.i)) {
      this.duplicates += 1;
      return { kind: "duplicate" };
    }
    const bytes = base64UrlToBytes(frame.payload);
    if (!bytes) {
      this.invalid += 1;
      return { kind: "invalid", error: "bad-shape" };
    }
    // Cap single-chunk memory even if the envelope claimed a small chunk size.
    if (bytes.length > 4096) {
      this.invalid += 1;
      return { kind: "invalid", error: "unsafe-limits" };
    }
    this.chunks.set(frame.i, bytes);
    return { kind: "stored", index: frame.i };
  }

  async reassemble(passphrase?: string): Promise<{ bytes: Uint8Array; name: string; mime: string }> {
    if (!this.meta) throw new Error("no-meta");
    if (!this.complete) throw new Error("incomplete");
    const ordered: Uint8Array[] = [];
    for (let i = 0; i < this.meta.n; i += 1) {
      const part = this.chunks.get(i);
      if (!part) throw new Error(`missing-chunk-${i}`);
      ordered.push(part);
    }
    const scanned = this.meta.n === 0 ? new Uint8Array(0) : joinChunks(ordered, this.meta.n, this.meta.size);

    // Verify what was scanned before decrypting: ciphertext hash for encrypted
    // transfers, plaintext hash otherwise.
    const actual = await sha256Hex(scanned);
    if (!hexEqual(actual, this.meta.sha256)) throw new Error("checksum-mismatch");

    if (this.meta.enc === 1) {
      if (!passphrase) throw new Error("passphrase-required");
      if (!this.meta.salt || !this.meta.iv) throw new Error("bad-envelope");
      const salt = base64UrlToBytes(this.meta.salt);
      const iv = base64UrlToBytes(this.meta.iv);
      if (!salt || !iv) throw new Error("bad-envelope");
      // Whole-payload decrypt matches whole-payload encrypt in sender.ts.
      const plain = await decryptBytes(scanned, passphrase, salt, iv);
      return { bytes: plain, name: sanitizeFilename(this.meta.name), mime: sanitizeMime(this.meta.mime) };
    }
    return { bytes: scanned, name: sanitizeFilename(this.meta.name), mime: sanitizeMime(this.meta.mime) };
  }
}
