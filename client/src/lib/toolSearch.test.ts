import { describe, expect, it } from "vitest";
import { SEARCH_SUGGESTION_LIMIT, searchTools } from "./toolSearch";

describe("tool search ranking", () => {
  it("returns nothing for an empty or whitespace query", () => {
    expect(searchTools("")).toEqual([]);
    expect(searchTools("   ")).toEqual([]);
  });

  it("caps results at the suggestion limit", () => {
    expect(searchTools("a")).toHaveLength(SEARCH_SUGGESTION_LIMIT);
    expect(searchTools("a", 3)).toHaveLength(3);
    // The cap is the default, but an explicit larger limit is honoured, never exceeded.
    expect(searchTools("a", 100).length).toBeGreaterThan(SEARCH_SUGGESTION_LIMIT);
  });

  it("puts a name prefix above a name substring and a category match", () => {
    expect(searchTools("word")[0]?.name).toBe("Word Counter");
    // "SEO Word Counter" starts with the query, so it leads the category-only matches.
    expect(searchTools("seo")[0]?.name).toBe("SEO Word Counter");
    // A pure category match is still included.
    expect(searchTools("crypto").some((tool) => tool.category === "Crypto & Security")).toBe(true);
  });

  it("is case-insensitive and stable", () => {
    expect(searchTools("WORD")[0]?.name).toBe("Word Counter");
    // Memoized: the same query returns the same array reference.
    expect(searchTools("word")).toBe(searchTools("word"));
  });

  it("matches Bangla fields even though tool names stay Latin", () => {
    const results = searchTools("লেখা");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((tool) => `${tool.description.bn} ${tool.categoryBn}`.includes("লেখা"))).toBe(true);
  });

  it("ranks multi-word queries with all tokens first (json csv)", () => {
    const results = searchTools("json csv", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.slug).toBe("json-to-csv-tsv");
  });

  it("tolerates extra spaces and case", () => {
    const a = searchTools("  JSON   csv  ", 10);
    const b = searchTools("json csv", 10);
    expect(a.map((t) => t.slug)).toEqual(b.map((t) => t.slug));
    expect(a[0]?.slug).toBe("json-to-csv-tsv");
  });

  it("returns no duplicates and is deterministic", () => {
    const results = searchTools("json csv", 20);
    const slugs = results.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const again = searchTools("json csv", 20);
    expect(again.map((t) => t.slug)).toEqual(slugs);
  });
});
