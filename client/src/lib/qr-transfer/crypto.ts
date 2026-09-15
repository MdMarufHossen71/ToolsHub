/**
 * Optional passphrase encryption for the optical channel.
 * Anyone who can see the QR sequence can capture it, so sensitive files
 * should use a pre-shared passphrase. Standard Web Crypto only: PBKDF2 ->
 * AES-GCM. No custom cryptography.
 */

import { base64UrlToBytes, bytesToBase64Url } from "./protocol";

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
  // slices of that ciphertext, so reordered scans stay decryptable.
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, bytes as BufferSource);
  return new Uint8Array(cipher);
}

export async function encryptChunk(
  chunk: Uint8Array,
  passphrase: string,
  saltB64: string,
  ivB64: string,
): Promise<Uint8Array> {
  const salt = base64UrlToBytes(saltB64);
  const iv = base64UrlToBytes(ivB64);
  if (!salt || !iv) throw new Error("bad-envelope");
  return encryptBytes(chunk, passphrase, salt, iv);
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

export async function decryptChunk(
  cipher: Uint8Array,
  passphrase: string,
  saltB64: string,
  ivB64: string,
): Promise<Uint8Array> {
  const salt = base64UrlToBytes(saltB64);
  const iv = base64UrlToBytes(ivB64);
  if (!salt || !iv) throw new Error("bad-envelope");
  return decryptBytes(cipher, passphrase, salt, iv);
}
