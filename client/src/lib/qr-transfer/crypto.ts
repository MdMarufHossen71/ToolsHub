/**
 * Optional passphrase encryption for the optical channel.
 * The envelope implementation is shared with the sound channel; this module
 * keeps the QR-specific base64 envelope wrappers.
 */

import { base64UrlToBytes } from "./protocol";
import {
  createEncryptionEnvelope,
  decryptBytes,
  encryptBytes,
  envelopeToMeta,
} from "../transfer/shared";

export { createEncryptionEnvelope, decryptBytes, encryptBytes, envelopeToMeta };

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
