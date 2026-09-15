/** Integrity helpers: per-chunk CRC-16 plus whole-file SHA-256 via Web Crypto. */

export function crc16Ccitt(text: string): number {
  const bytes = new TextEncoder().encode(text);
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i += 1) {
    // Loop-bounded; `?? 0` is type-level only.
    crc ^= (bytes[i] ?? 0) << 8;
    for (let b = 0; b < 8; b += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

export function bytesToHex(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i += 1) out += (view[i] ?? 0).toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

/** Constant-time-ish hex comparison to avoid early-exit timing hints. */
export function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
