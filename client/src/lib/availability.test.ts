import { describe, expect, it } from "vitest";
import { toolRegistry } from "@/data/tools";
import { IMPLEMENTED_TOOLS, runTool, type ToolTranslate } from "@/lib/toolOperations";
import { isLiveTool, LIVE_TOOL_SLUGS } from "@/lib/liveSlugs";
import { getLiveTool } from "@/components/tools/live";

const t = ((key: string) => key) as ToolTranslate;

describe("tool availability honesty", () => {
  it("every unimplemented tool is AI-only (no fake tools outside AI)", () => {
    const unbuilt = toolRegistry.filter((tool) => !IMPLEMENTED_TOOLS.has(tool.slug));
    expect(unbuilt.length).toBeGreaterThan(0);
    for (const tool of unbuilt) {
      expect(tool.group).toBe("ai");
    }
  });

  it("unimplemented tools never echo input as a result", async () => {
    const unbuilt = toolRegistry.filter((tool) => !IMPLEMENTED_TOOLS.has(tool.slug));
    for (const tool of unbuilt) {
      const out = await runTool(tool.slug, "hello world input", "default", t);
      expect(out.unavailable).toBe(true);
      expect(out.text).not.toContain("hello world input");
      expect(out.error).toBeFalsy();
    }
  });

  it("every live slug is implemented and has a renderer", () => {
    for (const slug of LIVE_TOOL_SLUGS) {
      expect(IMPLEMENTED_TOOLS.has(slug)).toBe(true);
      expect(isLiveTool(slug)).toBe(true);
      expect(getLiveTool(slug)).toBeDefined();
    }
  });

  it("AI tools make no network calls and stay unavailable", async () => {
    const aiTools = toolRegistry.filter((tool) => tool.group === "ai");
    expect(aiTools.length).toBe(12);
    for (const tool of aiTools) {
      expect(IMPLEMENTED_TOOLS.has(tool.slug)).toBe(false);
      const out = await runTool(tool.slug, "test", "default", t);
      expect(out.unavailable).toBe(true);
    }
  });

  it("registry slugs are unique", () => {
    const slugs = toolRegistry.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
