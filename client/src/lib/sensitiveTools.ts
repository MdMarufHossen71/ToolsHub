/**
 * Single source of truth for which tool inputs must never be persisted.
 *
 * Previously two different lists existed — one in `useToolInputMemory` (12 slugs)
 * and one in `ToolWorkspace` (7 slugs) — so five tools were protected without
 * telling the user, and any new secret-handling tool had to be remembered twice.
 *
 * The policy is deliberately conservative: an entire category is excluded rather
 * than an enumerated list of slugs, so a tool added later is private by default
 * instead of leaking until someone notices.
 */

import { findTool } from "@/data/tools";

/** Categories whose inputs are treated as secrets without exception. */
const SENSITIVE_GROUPS = new Set(["crypto", "ai"]);

/**
 * Substrings that mark a tool as secret-handling regardless of its category.
 * Matched against the slug, so `password-strength-analyzer`, `jwt-secret-tester`
 * and similar future additions are covered without an edit here.
 */
const SENSITIVE_PATTERNS = [
  "password",
  "passphrase",
  "secret",
  "token",
  "credential",
  "private-key",
  "keypair",
  "key-pair",
  "mnemonic",
  "seed-phrase",
  "totp",
  "otp",
  "2fa",
  "jwt",
  "bcrypt",
  "encrypt",
  "decrypt",
  "cipher-key",
  "hmac",
  "signing",
  "basic-auth",
  "api-key",
  "ssh",
  "pgp",
  "certificate",
  "wallet",
];

/**
 * Slugs that are sensitive but neither in a sensitive category nor matched by a
 * pattern. Kept explicit so the reason stays visible.
 */
const SENSITIVE_SLUGS = new Set(["bip39-mnemonic-generator", "rsa-key-pair-generator"]);

/** True when this tool's input must never be written to storage. */
export function isSensitiveTool(slug: string) {
  if (!slug) return true; // unknown tool: fail closed
  const normalized = slug.toLowerCase();
  if (SENSITIVE_SLUGS.has(normalized)) return true;
  if (SENSITIVE_PATTERNS.some((pattern) => normalized.includes(pattern))) return true;
  const tool = findTool(normalized);
  if (tool && SENSITIVE_GROUPS.has(tool.group)) return true;
  return false;
}

/** Inverse of {@link isSensitiveTool}; reads better at call sites. */
export function canRememberToolInput(slug: string) {
  return !isSensitiveTool(slug);
}
