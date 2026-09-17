import { describe, expect, it, vi } from "vitest";
import { toolRegistry } from "@/data/tools";
import { IMPLEMENTED_TOOLS, runTool, type ToolTranslate } from "@/lib/toolOperations";
import { isLiveTool, LIVE_TOOL_SLUGS } from "@/lib/liveSlugs";
import { getLiveTool } from "@/components/tools/live";

const t = ((key: string) => key) as ToolTranslate;

describe("tool availability honesty", () => {
  it("every catalogued tool is implemented (no stubs anywhere)", () => {
    const unbuilt = toolRegistry.filter((tool) => !IMPLEMENTED_TOOLS.has(tool.slug));
    expect(unbuilt).toEqual([]);
  });

  it("unknown slugs stay unavailable and never echo input as a result", async () => {
    const out = await runTool("not-a-real-tool", "hello world input", "default", t);
    expect(out.unavailable).toBe(true);
    expect(out.text).not.toContain("hello world input");
    expect(out.error).toBeFalsy();
  });

  it("every live slug is implemented and has a renderer", () => {
    for (const slug of LIVE_TOOL_SLUGS) {
      expect(IMPLEMENTED_TOOLS.has(slug)).toBe(true);
      expect(isLiveTool(slug)).toBe(true);
      expect(getLiveTool(slug)).toBeDefined();
    }
  });

  it("AI tools are implemented but degrade honestly without a key (no network)", async () => {
    const aiTools = toolRegistry.filter((tool) => tool.group === "ai");
    expect(aiTools.length).toBe(12);
    const spy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", spy);
    try {
      for (const tool of aiTools) {
        expect(IMPLEMENTED_TOOLS.has(tool.slug)).toBe(true);
        const out = await runTool(tool.slug, "hello world", "default", t, { fields: {} });
        if (isLiveTool(tool.slug)) {
          // Voice instruments render their own UI; they need no key and fail nothing.
          expect(out.error).toBeFalsy();
          expect(out.text).toBe("tool.result.interactive");
          continue;
        }
        // Missing key (node has no localStorage) or missing file: a clear error,
        // never a fake answer, and nothing reaches the network.
        expect(out.error).toBe(true);
        expect(out.text).not.toContain("hello world");
      }
      const chat = await runTool("ai-chat-assistant", "hello world", "default", t, { fields: {} });
      expect(chat.text).toBe("ai.error.missing-key");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("registry slugs are unique", () => {
    const slugs = toolRegistry.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
