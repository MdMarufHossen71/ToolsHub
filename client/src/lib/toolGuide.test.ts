import { describe, expect, it } from "vitest";
import { toolRegistry } from "@/data/tools";
import { IMPLEMENTED_TOOLS } from "./toolOperations";
import { guideKind, toolGuideSteps, type GuideKind } from "./toolGuide";

const bySlug = new Map(toolRegistry.map((tool) => [tool.slug, tool]));

describe("toolGuideSteps", () => {
  it("gives every implemented tool between three and five steps", () => {
    for (const slug of IMPLEMENTED_TOOLS) {
      const tool = bySlug.get(slug);
      expect(tool, `registry is missing implemented slug ${slug}`).toBeDefined();
      const steps = toolGuideSteps(tool!, "en", guideKind(slug, true));
      expect(steps.length, `${slug} produced ${steps.length} steps`).toBeGreaterThanOrEqual(3);
      expect(steps.length, `${slug} produced ${steps.length} steps`).toBeLessThanOrEqual(5);
      for (const item of steps) expect(item.key.length).toBeGreaterThan(0);
    }
  });

  it("invents no steps for a tool that is not built", () => {
    const tool = bySlug.get("ai-chat-assistant");
    expect(tool).toBeDefined();
    expect(toolGuideSteps(tool!, "en", guideKind("ai-chat-assistant", false))).toEqual([]);
    expect(guideKind("ai-chat-assistant", false)).toBe("unavailable");
  });

  it("names the real schema fields for a form tool", () => {
    const tool = bySlug.get("find-replace")!;
    const steps = toolGuideSteps(tool, "en", "form");
    expect(steps[0].key).toBe("tool.guide.step.form.fields");
    // The labels come from the schema, not a generic sentence.
    expect(steps[0].values?.fields).toBe("Text, Find, Replace with");
    const bn = toolGuideSteps(tool, "bn", "form");
    expect(bn[0].values?.fields).toBe("টেক্সট, খুঁজুন, বদলে দিন");
  });

  it("classifies live, file, form and text tools", () => {
    expect(guideKind("stopwatch", true)).toBe("live");
    expect(guideKind("file-hash-calculator", true)).toBe("file");
    expect(guideKind("image-resize", true)).toBe("file");
    expect(guideKind("find-replace", true)).toBe("form");
    expect(guideKind("hash-generator", true)).toBe("text");
  });

  it("gives live instruments their own control-specific first step", () => {
    const typing = toolGuideSteps(bySlug.get("typing-speed-test")!, "en", "live");
    const wheel = toolGuideSteps(bySlug.get("decision-wheel")!, "en", "live");
    expect(typing[0].key).toBe("tool.guide.live.s.typing");
    expect(wheel[0].key).toBe("tool.guide.live.s.wheel");
    expect(typing[0].key).not.toBe(wheel[0].key);
  });

  // A diagnostic for the Phase 3 acceptance note: prove the steps are not one block
  // copied 287 times, and show the spread across tool kinds.
  it("produces many distinct step variants", () => {
    const variants = new Set<string>();
    const perKind: Record<GuideKind, { tools: number; variants: Set<string> }> = {
      live: { tools: 0, variants: new Set() },
      file: { tools: 0, variants: new Set() },
      form: { tools: 0, variants: new Set() },
      text: { tools: 0, variants: new Set() },
      unavailable: { tools: 0, variants: new Set() },
    };
    for (const slug of IMPLEMENTED_TOOLS) {
      const tool = bySlug.get(slug)!;
      const kind = guideKind(slug, true);
      const signature = JSON.stringify(toolGuideSteps(tool, "en", kind));
      variants.add(signature);
      perKind[kind].tools += 1;
      perKind[kind].variants.add(signature);
    }
    const tally = Object.fromEntries(
      (Object.keys(perKind) as GuideKind[]).map((kind) => [kind, `${perKind[kind].variants.size} variants / ${perKind[kind].tools} tools`]),
    );
    console.log(`[guide] distinct how-to variants: ${variants.size} across ${IMPLEMENTED_TOOLS.size} implemented tools`, tally);
    expect(variants.size).toBeGreaterThan(100);
    // Free-text tools deliberately share the brief's generic "paste, watch, copy" flow;
    // the tool-specific variety lives in the form, file and live kinds.
    expect(perKind.text.variants.size).toBe(1);
    expect(perKind.form.variants.size).toBeGreaterThan(50);
    expect(perKind.file.variants.size).toBeGreaterThan(10);
    expect(perKind.live.variants.size).toBeGreaterThanOrEqual(15);
  });
});
