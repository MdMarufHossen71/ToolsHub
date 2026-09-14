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
});
