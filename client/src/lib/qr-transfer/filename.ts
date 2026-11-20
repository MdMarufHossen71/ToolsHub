/** Filename sanitization: receiver must never trust sender metadata blindly. */

import { QFT_MAX_NAME_CHARS } from "./types";
import { sanitizeFilename as sanitizeFilenameShared, sanitizeMime } from "../transfer/shared";

export { sanitizeMime };

export function sanitizeFilename(raw: unknown): string {
  return sanitizeFilenameShared(raw, QFT_MAX_NAME_CHARS);
}
