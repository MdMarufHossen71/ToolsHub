import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUNDLE_SOURCE,
  MAX_BUNDLE_BYTES,
  MAX_VALUE_BYTES,
  SCHEMA_VERSION,
  applyDataBundle,
  bundleFileName,
  clearAppData,
  exportLocalData,
  isAppKey,
  listAppKeys,
  migrateLegacyKeys,
  parseDataBundle,
  safeGet,
  safeRemove,
  safeSet,
  storageAvailable,
} from "./storage";

class MemoryStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

function installStorage() {
  (globalThis as Record<string, unknown>).localStorage = new MemoryStorage();
}

beforeEach(() => {
  installStorage();
  vi.restoreAllMocks();
});

describe("storageAvailable / safeGet / safeSet / safeRemove", () => {
  it("reports available with a working localStorage", () => {
    expect(storageAvailable()).toBe(true);
  });

  it("safeGet returns fallback for missing keys and parses stored JSON", () => {
    expect(safeGet("tgb:missing", "fb")).toBe("fb");
    expect(safeSet("tgb:a", { n: 1 }).ok).toBe(true);
    expect(safeGet("tgb:a", null)).toEqual({ n: 1 });
  });

  it("safeGet self-heals corrupted JSON", () => {
    localStorage.setItem("tgb:bad", "{not-json");
    expect(safeGet("tgb:bad", "fb")).toBe("fb");
    expect(localStorage.getItem("tgb:bad")).toBeNull();
  });

  it("safeSet rejects oversize values", () => {
    const big = "x".repeat(MAX_VALUE_BYTES + 1);
    const result = safeSet("tgb:big", big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("size");
  });

  it("safeSet rejects unstringifiable values", () => {
    const result = safeSet("tgb:bad", undefined as unknown as string);
    expect(result.ok).toBe(false);
  });

  it("safeSet maps quota errors", () => {
    const ls = localStorage as unknown as MemoryStorage;
    vi.spyOn(ls, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const result = safeSet("tgb:q", "v");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("quota");
  });

  it("safeRemove returns true and deletes", () => {
    safeSet("tgb:r", 1);
    expect(safeRemove("tgb:r")).toBe(true);
    expect(safeGet("tgb:r", null)).toBeNull();
  });
});

describe("unavailable storage (fresh module, no localStorage)", () => {
  it("falls back without throwing", async () => {
    vi.resetModules();
    const saved = (globalThis as Record<string, unknown>).localStorage;
    // simulate private browsing
    delete (globalThis as Record<string, unknown>).localStorage;
    const fresh = await import("./storage");
    expect(fresh.storageAvailable()).toBe(false);
    expect(fresh.safeGet("tgb:x", "fb")).toBe("fb");
    expect(fresh.safeSet("tgb:x", 1)).toEqual({ ok: false, error: "unavailable" });
    expect(fresh.listAppKeys()).toEqual([]);
    (globalThis as Record<string, unknown>).localStorage = saved;
    vi.resetModules();
  });
});

describe("namespacing / export filtering", () => {
  it("isAppKey only accepts tgb: prefix", () => {
    expect(isAppKey("tgb:tool:x")).toBe(true);
    expect(isAppKey("other:x")).toBe(false);
    expect(isAppKey("tgb-language")).toBe(false);
  });

  it("listAppKeys ignores foreign keys", () => {
    localStorage.setItem("foreign", "1");
    safeSet("tgb:settings:a", 1);
    expect(listAppKeys()).toEqual(["tgb:settings:a"]);
  });

  it("exportLocalData never includes foreign keys or oversize values", () => {
    localStorage.setItem("foreign-secret", "s3cr3t");
    safeSet("tgb:settings:a", 1);
    localStorage.setItem("tgb:tool:big:input", `"${"y".repeat(MAX_VALUE_BYTES + 10)}"`);
    const bundle = exportLocalData();
    expect(bundle.source).toBe(BUNDLE_SOURCE);
    expect(bundle.version).toBe(SCHEMA_VERSION);
    expect(bundle.localStorage["foreign-secret"]).toBeUndefined();
    expect(Object.keys(bundle.localStorage)).toContain("tgb:settings:a");
    expect(bundle.localStorage["tgb:tool:big:input"]).toBeUndefined();
  });

  it("bundleFileName is date-prefixed", () => {
    expect(bundleFileName(new Date("2026-01-02T00:00:00Z"))).toBe("toolshub-data-2026-01-02.json");
  });
});

describe("parseDataBundle validation", () => {
  const good = () =>
    JSON.stringify({
      version: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      source: BUNDLE_SOURCE,
      localStorage: { "tgb:settings:a": "1" },
    });

  it("accepts a valid bundle", () => {
    const parsed = parseDataBundle(good());
    expect(parsed.ok).toBe(true);
  });

  it("accepts pre-rename backups but stamps new exports canonically", () => {
    const legacy = JSON.stringify({ version: 2, source: "Tools & Games BD", localStorage: { "tgb:settings:a": "1" } });
    const parsed = parseDataBundle(legacy);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.source).toBe(BUNDLE_SOURCE);
  });

  it("rejects oversize text", () => {
    expect(parseDataBundle("x".repeat(MAX_BUNDLE_BYTES + 1))).toEqual({ ok: false, error: "size" });
  });

  it("rejects invalid JSON / shape / source / version", () => {
    expect(parseDataBundle("{nope")).toEqual({ ok: false, error: "invalid" });
    expect(parseDataBundle("[]")).toEqual({ ok: false, error: "shape" });
    expect(parseDataBundle(JSON.stringify({ version: 2, source: "Evil", localStorage: {} }))).toEqual({
      ok: false,
      error: "source",
    });
    expect(parseDataBundle(JSON.stringify({ version: 99, source: BUNDLE_SOURCE, localStorage: {} }))).toEqual({
      ok: false,
      error: "version",
    });
    expect(parseDataBundle(JSON.stringify({ version: 2, source: BUNDLE_SOURCE, localStorage: [] }))).toEqual({
      ok: false,
      error: "shape",
    });
  });

  it("rejects foreign keys and non-string values", () => {
    const foreign = JSON.stringify({
      version: 2,
      source: BUNDLE_SOURCE,
      localStorage: { "evil:key": "1" },
    });
    expect(parseDataBundle(foreign)).toEqual({ ok: false, error: "namespace" });
    const nonString = JSON.stringify({
      version: 2,
      source: BUNDLE_SOURCE,
      localStorage: { "tgb:a": 42 },
    });
    expect(parseDataBundle(nonString)).toEqual({ ok: false, error: "shape" });
  });

  it("upgrades legacy hyphenated keys", () => {
    const legacy = JSON.stringify({
      version: 1,
      source: BUNDLE_SOURCE,
      localStorage: { "tgb-language": '"bn"' },
    });
    const parsed = parseDataBundle(legacy);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.localStorage["tgb:settings:language"]).toBe('"bn"');
  });
});

describe("applyDataBundle merge vs replace + rollback", () => {
  it("merge overwrites matches and leaves the rest", () => {
    safeSet("tgb:settings:keep", "old");
    safeSet("tgb:settings:other", "x");
    const parsed = parseDataBundle(
      JSON.stringify({
        version: 2,
        source: BUNDLE_SOURCE,
        localStorage: { "tgb:settings:keep": '"new"' },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = applyDataBundle(parsed.value, "merge");
    expect(result).toEqual({ ok: true, value: { imported: 1, removed: 0, unchanged: 0 } });
    expect(safeGet("tgb:settings:other", null)).toBe("x");
  });

  it("replace removes app keys missing from the bundle", () => {
    safeSet("tgb:settings:gone", 1);
    localStorage.setItem("foreign-keep", "1");
    const parsed = parseDataBundle(
      JSON.stringify({ version: 2, source: BUNDLE_SOURCE, localStorage: { "tgb:settings:new": "1" } }),
    );
    if (!parsed.ok) throw new Error("parse failed");
    const result = applyDataBundle(parsed.value, "replace");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.removed).toBeGreaterThanOrEqual(1);
    expect(localStorage.getItem("foreign-keep")).toBe("1");
  });

  it("counts unchanged keys", () => {
    safeSet("tgb:settings:same", 7);
    const raw = localStorage.getItem("tgb:settings:same")!;
    const parsed = parseDataBundle(
      JSON.stringify({ version: 2, source: BUNDLE_SOURCE, localStorage: { "tgb:settings:same": raw } }),
    );
    if (!parsed.ok) throw new Error("parse failed");
    const result = applyDataBundle(parsed.value, "merge");
    if (!result.ok) throw new Error("apply failed");
    expect(result.value.unchanged).toBe(1);
    expect(result.value.imported).toBe(0);
  });

  it("rolls back on quota and reports quota", () => {
    safeSet("tgb:settings:a", "old");
    const ls = localStorage as unknown as MemoryStorage;
    const real = ls.setItem.bind(ls);
    // Fail only the second key so rollback itself can still write.
    vi.spyOn(ls, "setItem").mockImplementation((k: string, v: string) => {
      if (k === "tgb:settings:b") throw new DOMException("full", "QuotaExceededError");
      return real(k, v);
    });
    const parsed = parseDataBundle(
      JSON.stringify({
        version: 2,
        source: BUNDLE_SOURCE,
        localStorage: { "tgb:settings:a": '"new"', "tgb:settings:b": '"b"' },
      }),
    );
    if (!parsed.ok) throw new Error("parse failed");
    const result = applyDataBundle(parsed.value, "merge");
    expect(result).toEqual({ ok: false, error: "quota" });
    expect(safeGet("tgb:settings:a", null)).toBe("old");
  });
});

describe("clearAppData + migrateLegacyKeys", () => {
  it("clear removes only namespaced keys and reports count", () => {
    safeSet("tgb:settings:a", 1);
    safeSet("tgb:tool:x:input", "y");
    localStorage.setItem("neighbour", "keep");
    const result = clearAppData();
    expect(result).toEqual({ ok: true, value: 2 });
    expect(localStorage.getItem("neighbour")).toBe("keep");
  });

  it("migrates hyphenated keys once and re-encodes raw strings", () => {
    localStorage.setItem("tgb-language", "bn");
    localStorage.setItem("tgb-appearance", '"dark"');
    const moved = migrateLegacyKeys();
    expect(moved).toBeGreaterThanOrEqual(2);
    expect(safeGet("tgb:settings:language", null)).toBe("bn");
    expect(localStorage.getItem("tgb-language")).toBeNull();
    expect(migrateLegacyKeys()).toBe(0);
  });
});
