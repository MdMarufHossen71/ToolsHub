import { describe, expect, it } from "vitest";
import { toolRegistry } from "@/data/tools";
import { isLiveTool } from "./liveSlugs";
import { IMPLEMENTED_TOOLS } from "./toolOperations";
import { guideKind, toolGuideSteps } from "./toolGuide";
import { getToolSchema } from "./toolSchemas";
import { resolveInputMode } from "./toolInputMode";

const bySlug = new Map(toolRegistry.map((tool) => [tool.slug, tool]));

/**
 * The guide's kind is a pure function of the shared predicate: a fields-or-accept schema
 * is the workbench's form branch, and the guide describes that branch. A schema that also
 * accepts a file keeps the file-first steps (the file is what the reader must supply
 * first); a fields-only schema gets the form steps; the rest is free text.
 */
function expectedGuideKind(slug: string): string {
  const schema = getToolSchema(slug);
  const mode = resolveInputMode(slug, schema);
  if (mode === "file-hash") return "file";
  if (mode === "form") return schema?.accept ? "file" : "form";
  return "text";
}

describe("resolveInputMode", () => {
  it("routes the hash calculator to its bespoke file flow", () => {
    expect(resolveInputMode("file-hash-calculator")).toBe("file-hash");
  });

  it("routes a fields schema to the form branch", () => {
    expect(resolveInputMode("text-repeater")).toBe("form");
  });

  it("routes an accept-only schema to the form branch so the file picker renders", () => {
    expect(resolveInputMode("image-base64")).toBe("form");
    expect(resolveInputMode("meme-generator")).toBe("form");
  });

  it("routes a plain tool to the textarea", () => {
    expect(resolveInputMode("reverse-text")).toBe("text");
  });

  it("is exactly fields-or-accept for every implemented tool", () => {
    for (const slug of IMPLEMENTED_TOOLS) {
      const schema = getToolSchema(slug);
      const mode = resolveInputMode(slug, schema);
      if (slug === "file-hash-calculator") {
        expect(mode, slug).toBe("file-hash");
        continue;
      }
      const wantsForm = Boolean(schema && (schema.fields.length > 0 || schema.accept));
      expect(mode, slug).toBe(wantsForm ? "form" : "text");
    }
  });
});

describe("toolGuide agrees with the input predicate", () => {
  it("agrees for the representative slugs from the defect report", () => {
    for (const slug of ["file-hash-calculator", "text-repeater", "meme-generator", "image-base64", "reverse-text"]) {
      expect(guideKind(slug, true), slug).toBe(expectedGuideKind(slug));
    }
    expect(guideKind("text-repeater", true)).toBe("form");
    expect(guideKind("reverse-text", true)).toBe("text");
    expect(guideKind("file-hash-calculator", true)).toBe("file");
    // Accept tools stay file-first even though the workspace uses the form branch.
    expect(guideKind("image-base64", true)).toBe("file");
    expect(guideKind("meme-generator", true)).toBe("file");
  });

  it("never disagrees across every implemented non-live tool", () => {
    const mismatches: string[] = [];
    for (const slug of IMPLEMENTED_TOOLS) {
      if (isLiveTool(slug)) continue;
      const actual = guideKind(slug, true);
      const expected = expectedGuideKind(slug);
      if (actual !== expected) mismatches.push(`${slug}: guide=${actual} predicate=${expected}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("gives an accept-only tool file-oriented steps", () => {
    const tool = bySlug.get("image-base64")!;
    const steps = toolGuideSteps(tool, "en", guideKind("image-base64", true));
    expect(steps[0].key).toBe("tool.guide.step.file.choose");
  });
});
