/**
 * Local-first storage layer.
 *
 * Every key this application owns is prefixed with `tgb:`. Nothing outside that
 * namespace is ever read into an export, written by an import, or removed by
 * "clear my data" — the origin can be shared with unrelated static sites
 * (GitHub Pages serves every project of a user from one origin), so treating
 * `localStorage` as exclusively ours would leak or destroy a neighbour's data.
 */

export type StorageFailure =
  | "quota" // storage is full
  | "unavailable" // storage API missing, disabled, or throwing (private browsing)
  | "invalid" // payload is not parseable JSON
  | "version" // bundle schema version is not supported
  | "source" // bundle was not produced by this application
  | "shape" // bundle structure or value types are wrong
  | "namespace" // bundle contains keys outside our namespace
  | "size"; // bundle or one of its values exceeds the accepted limit

export type StorageResult<T> = { ok: true; value: T } | { ok: false; error: StorageFailure };

/** Canonical namespace for every key this application owns. */
export const STORAGE_PREFIX = "tgb:";

/** Bumped when the persisted shape changes in a way that needs a migration. */
export const SCHEMA_VERSION = 2;

/** Largest single value we will write. Guards against pasting a huge document into a tool. */
export const MAX_VALUE_BYTES = 64 * 1024;

/** Largest import file we will parse. */
export const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;

/** Largest number of keys an import may contain. */
export const MAX_BUNDLE_KEYS = 2000;

export const toolMemoryKey = (slug: string) => `${STORAGE_PREFIX}tool:${slug}:input`;
export const gameStateKey = (slug: string) => `${STORAGE_PREFIX}game:${slug}:state`;
export const settingsKey = (name: string) => `${STORAGE_PREFIX}settings:${name}`;

/**
 * The visitor's own AI provider key. It lives in localStorage so it never
 * leaves the device, but it must never travel: backups are files people mail
 * to themselves, so exporting a raw secret would turn every backup into a leak.
 */
export const AI_SECRET_KEY = `${STORAGE_PREFIX}ai:secret`;

/** Keys that must never be exported or imported. */
const SECRET_KEYS: ReadonlySet<string> = new Set([AI_SECRET_KEY]);

/** True when `key` holds a secret that must not travel in bundles. */
export function isSecretKey(key: string) {
  return SECRET_KEYS.has(key);
}
const SCHEMA_KEY = `${STORAGE_PREFIX}meta:schema`;

/** True when `key` belongs to this application. */
export function isAppKey(key: string) {
  return key.startsWith(STORAGE_PREFIX);
}

function isQuotaError(error: unknown) {
  if (!(error instanceof DOMException)) return false;
  return error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22 || error.code === 1014;
}

function byteLength(value: string) {
  try {
    return new TextEncoder().encode(value).length;
  } catch {
    return value.length;
  }
}

let availability: boolean | null = null;

/**
 * Probes whether `localStorage` can actually be written to. Safari in private
 * mode exposes the API but throws on `setItem`, so presence alone is not enough.
 * The result is cached because the answer cannot change within a page lifetime.
 */
export function storageAvailable() {
  if (availability !== null) return availability;
  try {
    const probe = `${STORAGE_PREFIX}meta:probe`;
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    availability = true;
  } catch {
    availability = false;
  }
  return availability;
}

/** Reads and parses a key. Corrupted JSON is removed so it cannot fail forever. */
export function safeGet<T>(key: string, fallback: T): T {
  if (!storageAvailable()) return fallback;
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Self-heal: a value we cannot parse is worse than no value at all.
    safeRemove(key);
    return fallback;
  }
}

export function safeSet<T>(key: string, value: T): StorageResult<null> {
  if (!storageAvailable()) return { ok: false, error: "unavailable" };
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (serialized === undefined) return { ok: false, error: "invalid" };
  if (byteLength(serialized) > MAX_VALUE_BYTES) return { ok: false, error: "size" };
  try {
    localStorage.setItem(key, serialized);
    return { ok: true, value: null };
  } catch (error) {
    return { ok: false, error: isQuotaError(error) ? "quota" : "unavailable" };
  }
}

export function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Every key on this origin that belongs to us, snapshotted before mutation. */
export function listAppKeys(): string[] {
  if (!storageAvailable()) return [];
  const keys: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && isAppKey(key)) keys.push(key);
    }
  } catch {
    return keys;
  }
  return keys;
}

export type DataBundle = {
  version: number;
  createdAt: string;
  source: typeof BUNDLE_SOURCE | typeof LEGACY_BUNDLE_SOURCE;
  localStorage: Record<string, string>;
};

export const BUNDLE_SOURCE = "ToolsHub" as const;
/** Pre-rename backups stay importable; new exports always stamp `BUNDLE_SOURCE`. */
export const LEGACY_BUNDLE_SOURCE = "Tools & Games BD" as const;

/** Exports only app-namespaced keys. Foreign keys on this origin are never read. */
export function exportLocalData(): DataBundle {
  const data: Record<string, string> = {};
  for (const key of listAppKeys()) {
    if (key === SCHEMA_KEY) continue;
    // Secrets never leave the device, not even inside the visitor's own backup.
    if (isSecretKey(key)) continue;
    try {
      const value = localStorage.getItem(key);
      if (value !== null && byteLength(value) <= MAX_VALUE_BYTES) data[key] = value;
    } catch {
      // Skip an unreadable key rather than abandoning the whole export.
    }
  }
  return { version: SCHEMA_VERSION, createdAt: new Date().toISOString(), source: BUNDLE_SOURCE, localStorage: data };
}

export function bundleFileName(now = new Date()) {
  return `toolshub-data-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Triggers a download of the current export. The anchor is attached to the
 * document (Firefox ignores clicks on detached nodes), removed immediately, and
 * the object URL is revoked on the next task so the download can start first.
 */
export function downloadDataBundle(): StorageResult<number> {
  const bundle = exportLocalData();
  const count = Object.keys(bundle.localStorage).length;
  let url = "";
  let anchor: HTMLAnchorElement | null = null;
  try {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    url = URL.createObjectURL(blob);
    anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = bundleFileName();
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    return { ok: true, value: count };
  } catch {
    return { ok: false, error: "unavailable" };
  } finally {
    if (anchor?.parentNode) anchor.parentNode.removeChild(anchor);
    if (url) setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Validates an import candidate completely before anything is written. Returns a
 * specific failure reason so the UI can explain what was wrong.
 */
export function parseDataBundle(text: string): StorageResult<DataBundle> {
  if (byteLength(text) > MAX_BUNDLE_BYTES) return { ok: false, error: "size" };

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "shape" };

  const candidate = data as Partial<DataBundle>;
  if (candidate.source !== BUNDLE_SOURCE && candidate.source !== LEGACY_BUNDLE_SOURCE) return { ok: false, error: "source" };
  if (typeof candidate.version !== "number" || !Number.isInteger(candidate.version)) return { ok: false, error: "version" };
  if (candidate.version < 1 || candidate.version > SCHEMA_VERSION) return { ok: false, error: "version" };

  const entries = candidate.localStorage;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return { ok: false, error: "shape" };

  const pairs = Object.entries(entries);
  if (pairs.length > MAX_BUNDLE_KEYS) return { ok: false, error: "size" };

  const normalized: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (typeof value !== "string") return { ok: false, error: "shape" };
    if (byteLength(value) > MAX_VALUE_BYTES) return { ok: false, error: "size" };
    // Version 1 bundles used hyphenated settings keys; accept and upgrade them.
    const upgraded = LEGACY_KEY_MAP[key] ?? key;
    if (!isAppKey(upgraded)) return { ok: false, error: "namespace" };
    // A bundle carrying a secret is either hand-edited or from a build that did
    // not exclude secrets: refuse it rather than writing a raw key to storage.
    if (isSecretKey(upgraded)) return { ok: false, error: "shape" };
    normalized[upgraded] = value;
  }

  return {
    ok: true,
    value: {
      version: candidate.version,
      createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
      source: BUNDLE_SOURCE,
      localStorage: normalized,
    },
  };
}

export type ImportMode = "merge" | "replace";
export type ImportReport = { imported: number; removed: number; unchanged: number };

/**
 * Applies a validated bundle.
 *
 * `merge` overwrites matching keys and leaves everything else alone.
 * `replace` additionally removes app-namespaced keys that the bundle does not
 * contain. Either way, capacity is checked first so a partial write cannot leave
 * storage in a half-imported state on quota exhaustion.
 */
export function applyDataBundle(bundle: DataBundle, mode: ImportMode): StorageResult<ImportReport> {
  if (!storageAvailable()) return { ok: false, error: "unavailable" };

  const incoming = Object.entries(bundle.localStorage);
  const existing = listAppKeys();

  // Dry run: every key must be ours and within limits before a single write.
  for (const [key, value] of incoming) {
    if (!isAppKey(key)) return { ok: false, error: "namespace" };
    if (isSecretKey(key)) return { ok: false, error: "shape" };
    if (typeof value !== "string") return { ok: false, error: "shape" };
    if (byteLength(value) > MAX_VALUE_BYTES) return { ok: false, error: "size" };
  }

  const previous = new Map<string, string | null>();
  const rollback = () => {
    previous.forEach((value, key) => {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        // Best effort — nothing more useful is available at this point.
      }
    });
  };

  let imported = 0;
  let removed = 0;
  let unchanged = 0;

  try {
    for (const [key, value] of incoming) {
      const current = localStorage.getItem(key);
      if (current === value) {
        unchanged += 1;
        continue;
      }
      previous.set(key, current);
      localStorage.setItem(key, value);
      imported += 1;
    }

    if (mode === "replace") {
      const keep = new Set(Object.keys(bundle.localStorage));
      for (const key of existing) {
        if (keep.has(key) || key === SCHEMA_KEY) continue;
        previous.set(key, localStorage.getItem(key));
        localStorage.removeItem(key);
        removed += 1;
      }
    }
  } catch (error) {
    rollback();
    return { ok: false, error: isQuotaError(error) ? "quota" : "unavailable" };
  }

  safeSet(SCHEMA_KEY, SCHEMA_VERSION);
  return { ok: true, value: { imported, removed, unchanged } };
}

/** Removes only app-namespaced keys. Never calls `localStorage.clear()`. */
export function clearAppData(): StorageResult<number> {
  if (!storageAvailable()) return { ok: false, error: "unavailable" };
  const keys = listAppKeys();
  let cleared = 0;
  for (const key of keys) {
    if (safeRemove(key)) cleared += 1;
  }
  return { ok: true, value: cleared };
}

/** Pre-namespace keys, mapped to their canonical replacements. */
const LEGACY_KEY_MAP: Record<string, string> = {
  "tgb-language": settingsKey("language"),
  "tgb-appearance": settingsKey("appearance"),
  "tgb-theme": settingsKey("appearance"),
  "tgb-custom-themes": settingsKey("customThemes"),
};

/**
 * One-time move of hyphenated keys into the `tgb:` namespace. Values were stored
 * raw (not JSON) by the old code, so they are re-encoded on the way across.
 * Guarded by a schema marker so it runs at most once per browser.
 */
export function migrateLegacyKeys(): number {
  if (!storageAvailable()) return 0;
  const recorded = safeGet<number>(SCHEMA_KEY, 0);
  if (recorded >= SCHEMA_VERSION) return 0;

  let moved = 0;
  for (const [legacy, canonical] of Object.entries(LEGACY_KEY_MAP)) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(legacy);
    } catch {
      continue;
    }
    if (raw === null) continue;

    // `tgb-theme` is a fallback for `tgb-appearance`; do not let it win.
    const alreadyPresent = safeGet<unknown>(canonical, undefined) !== undefined;
    if (!alreadyPresent) {
      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw; // old code wrote plain strings for language/appearance
      }
      if (safeSet(canonical, parsed).ok) moved += 1;
    }
    safeRemove(legacy);
  }

  safeSet(SCHEMA_KEY, SCHEMA_VERSION);
  return moved;
}
