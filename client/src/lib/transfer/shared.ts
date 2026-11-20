/**
 * Helpers shared by the offline transfer tools (QR and sound).
 *
 * These live in one module so both channels use exactly the same base64url
 * alphabet, CRC, hash comparison, filename rules and passphrase envelope.
 * Nothing here touches the DOM or the network.
 */

/* ------------------------------------------------------------------ */
/* base64url                                                           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* integrity                                                           */
/* ------------------------------------------------------------------ */

/** CRC-16/CCITT-FALSE over arbitrary bytes. */
export function crc16CcittBytes(bytes: Uint8Array): number {
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

/** CRC-16/CCITT-FALSE over the UTF-8 encoding of a string. */
export function crc16Ccitt(text: string): number {
  return crc16CcittBytes(new TextEncoder().encode(text));
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

/* ------------------------------------------------------------------ */
/* filenames                                                           */
/* ------------------------------------------------------------------ */

export function sanitizeFilename(raw: unknown, maxChars = 255): string {
  if (typeof raw !== "string") return "download.bin";
  // Strip any directory components; browsers download to one folder only.
  let name = raw.split(/[\\/]/).pop() ?? "";
  // Remove control characters and trim dot-space edges that hide extensions.
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/^[. ]+/, "").replace(/[. ]+$/, "");
  if (!name) return "download.bin";
  if (name === "." || name === "..") return "download.bin";
  if (name.length > maxChars) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : "";
    name = `${name.slice(0, maxChars - ext.length)}${ext}`;
  }
  return name;
}

export function sanitizeMime(raw: unknown, fallback = "application/octet-stream"): string {
  if (typeof raw !== "string" || !raw) return fallback;
  const mime = raw.trim().slice(0, 127);
  if (!/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*(\s*;\s*.*)?$/.test(mime)) return fallback;
  return mime;
}

/* ------------------------------------------------------------------ */
/* sample-rate conversion                                              */
/* ------------------------------------------------------------------ */

/**
 * Linear interpolation between two rates. Used only when the device will not
 * give us a 48 kHz context (ggwave's native rate); the error at FSK
 * frequencies is far below what the Reed-Solomon layer can absorb.
 */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) return input;
  const ratio = toRate / fromRate;
  const length = Math.max(1, Math.round(input.length * ratio));
  const out = new Float32Array(length);
  const last = input.length - 1;
  for (let i = 0; i < length; i += 1) {
    const position = i / ratio;
    const base = Math.floor(position);
    const next = Math.min(last, base + 1);
    const t = position - base;
    out[i] = (input[base] ?? 0) * (1 - t) + (input[next] ?? 0) * t;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* optional passphrase encryption                                      */
/* ------------------------------------------------------------------ */

async function deriveFileKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 120000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createEncryptionEnvelope(): Promise<{ salt: Uint8Array; iv: Uint8Array }> {
  return {
    salt: crypto.getRandomValues(new Uint8Array(16)),
    iv: crypto.getRandomValues(new Uint8Array(12)),
  };
}

export function envelopeToMeta(salt: Uint8Array, iv: Uint8Array): { salt: string; iv: string } {
  return { salt: bytesToBase64Url(salt), iv: bytesToBase64Url(iv) };
}

export async function encryptBytes(bytes: Uint8Array, passphrase: string, salt: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const key = await deriveFileKey(passphrase, salt);
  // Whole file is encrypted once with a random envelope IV; chunks are just
  // slices of that ciphertext, so reordered pieces stay decryptable.
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, bytes as BufferSource);
  return new Uint8Array(cipher);
}

export async function decryptBytes(cipher: Uint8Array, passphrase: string, salt: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const key = await deriveFileKey(passphrase, salt);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, cipher as BufferSource);
    return new Uint8Array(plain);
  } catch {
    throw new Error("wrong-passphrase");
  }
}
