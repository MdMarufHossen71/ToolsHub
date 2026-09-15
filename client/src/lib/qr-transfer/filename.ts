/** Filename sanitization: receiver must never trust sender metadata blindly. */

import { QFT_MAX_NAME_CHARS } from "./types";

export function sanitizeFilename(raw: unknown): string {
  if (typeof raw !== "string") return "download.bin";
  // Strip any directory components; browsers download to one folder only.
  let name = raw.split(/[\\/]/).pop() ?? "";
  // Remove control characters and trim dot-space edges that hide extensions.
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/^[. ]+/, "").replace(/[. ]+$/, "");
  if (!name) return "download.bin";
  if (name === "." || name === "..") return "download.bin";
  if (name.length > QFT_MAX_NAME_CHARS) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : "";
    name = `${name.slice(0, QFT_MAX_NAME_CHARS - ext.length)}${ext}`;
  }
  return name;
}

export function sanitizeMime(raw: unknown, fallback = "application/octet-stream"): string {
  if (typeof raw !== "string" || !raw) return fallback;
  const mime = raw.trim().slice(0, 127);
  if (!/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*(\s*;\s*.*)?$/.test(mime)) return fallback;
  return mime;
}
