import { beforeEach, describe, expect, it } from "vitest";
import { getFavoriteTools, isFavorite, MAX_FAVORITES, toggleFavorite } from "./favorites";
import { toolRegistry } from "@/data/tools";

const KEY = "tgb:favorite-tools";

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

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = new MemoryStorage();
});

describe("favorites", () => {
  it("starts empty and toggles a known tool on and off", () => {
    expect(getFavoriteTools()).toEqual([]);
    expect(isFavorite("word-counter")).toBe(false);

    expect(toggleFavorite("word-counter")).toBe(true);
    expect(isFavorite("word-counter")).toBe(true);
    expect(getFavoriteTools().map((tool) => tool.slug)).toEqual(["word-counter"]);

    expect(toggleFavorite("word-counter")).toBe(false);
    expect(isFavorite("word-counter")).toBe(false);
    expect(getFavoriteTools()).toEqual([]);
  });

  it("orders the list most-recently-starred first", () => {
    toggleFavorite("word-counter");
    toggleFavorite("json-formatter-validator");
    expect(getFavoriteTools().map((tool) => tool.slug)).toEqual(["json-formatter-validator", "word-counter"]);

    // Un-starring and re-starring moves a tool back to the front.
    toggleFavorite("word-counter");
    toggleFavorite("word-counter");
    expect(getFavoriteTools().map((tool) => tool.slug)).toEqual(["word-counter", "json-formatter-validator"]);
  });

  it("rejects an unknown slug instead of storing it", () => {
    expect(toggleFavorite("not-a-tool")).toBe(false);
    expect(getFavoriteTools()).toEqual([]);
  });

  it("drops unknown slugs and non-strings from a hand-edited stored value", () => {
    localStorage.setItem(KEY, JSON.stringify(["nope", 42, null, "word-counter", "word-counter"]));
    expect(getFavoriteTools().map((tool) => tool.slug)).toEqual(["word-counter"]);
    expect(isFavorite("nope")).toBe(false);
  });

  it("survives a malformed or non-array stored value", () => {
    localStorage.setItem(KEY, JSON.stringify({ favorite: "word-counter" }));
    expect(getFavoriteTools()).toEqual([]);

    // Not JSON at all: `safeGet` self-heals the key rather than throwing forever.
    localStorage.setItem(KEY, "{not json");
    expect(getFavoriteTools()).toEqual([]);
  });

  it(`caps the stored list at ${MAX_FAVORITES} on read`, () => {
    const slugs = toolRegistry.slice(0, MAX_FAVORITES + 5).map((tool) => tool.slug);
    localStorage.setItem(KEY, JSON.stringify(slugs));
    const kept = getFavoriteTools().map((tool) => tool.slug);
    expect(kept).toHaveLength(MAX_FAVORITES);
    expect(kept).toEqual(slugs.slice(0, MAX_FAVORITES));
  });

  it("drops the oldest entry when starring past the cap", () => {
    const slugs = toolRegistry.slice(0, MAX_FAVORITES + 3).map((tool) => tool.slug);
    for (const slug of slugs) toggleFavorite(slug);
    const kept = getFavoriteTools().map((tool) => tool.slug);
    expect(kept).toHaveLength(MAX_FAVORITES);
    // Newest first, oldest three gone.
    expect(kept[0]).toBe(slugs[slugs.length - 1]);
    expect(kept).not.toContain(slugs[0]);
  });
});
