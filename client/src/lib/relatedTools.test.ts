import { describe, expect, it } from "vitest";
import type { Tool } from "@/data/tools";
import { toolRegistry } from "@/data/tools";
import { relatedTools } from "./relatedTools";

const make = (over: Partial<Tool> & { slug: string; name: string }): Tool => ({
  category: "Test",
  categoryBn: "টেস্ট",
  group: "text",
  description: { en: "d", bn: "d" },
  keywords: [],
  ...over,
});

describe("relatedTools", () => {
  it("is deterministic for the same input", () => {
    const first = relatedTools("word-counter", toolRegistry).map((tool) => tool.slug);
    const second = relatedTools("word-counter", toolRegistry).map((tool) => tool.slug);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it("never includes the current tool, never repeats, and caps at six", { timeout: 30000 }, () => {
    for (const tool of toolRegistry) {
      const list = relatedTools(tool.slug, toolRegistry).map((entry) => entry.slug);
      expect(list).not.toContain(tool.slug);
      expect(new Set(list).size).toBe(list.length);
      expect(list.length).toBeLessThanOrEqual(6);
    }
  });

  it("returns six for a tool whose group is large enough", () => {
    expect(relatedTools("word-counter", toolRegistry)).toHaveLength(6);
    expect(relatedTools("bmi-calculator", toolRegistry)).toHaveLength(6);
  });

  it("prefers the same group before reaching across groups", () => {
    const list = relatedTools("json-formatter-validator", toolRegistry);
    expect(list.length).toBe(6);
    expect(list.every((tool) => tool.group === "data")).toBe(true);
  });

  it("backfills from other groups when the tool's group is tiny, so it is never empty", () => {
    const tools = [
      make({ slug: "solo", name: "Solo", group: "ai" }),
      make({ slug: "alpha", name: "Alpha", group: "text" }),
      make({ slug: "beta", name: "Beta", group: "color" }),
    ];
    const list = relatedTools("solo", tools);
    expect(list.map((tool) => tool.slug)).toEqual(["alpha", "beta"]);
  });

  it("ranks shared keywords ahead of an unrelated sibling", () => {
    const tools = [
      make({ slug: "base", name: "Base", group: "text", keywords: ["json", "format"] }),
      make({ slug: "close", name: "Close", group: "text", keywords: ["json", "format", "pretty"] }),
      make({ slug: "far", name: "Far", group: "text", keywords: ["unrelated"] }),
    ];
    expect(relatedTools("base", tools)[0]?.slug).toBe("close");
  });

  it("returns nothing for a slug that is not in the registry", () => {
    expect(relatedTools("not-a-real-tool", toolRegistry)).toEqual([]);
  });
});
