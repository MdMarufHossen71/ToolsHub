import { describe, expect, it } from "vitest";
import { IMPLEMENTED_TOOLS, runTool, toolPlaceholder, type ToolTranslate } from "./toolOperations";
import { defaultFieldValues, getToolSchema } from "./toolSchemas";

/**
 * The durable safety net for Phase 3's empty/error state audit.
 *
 * Every slug the registry reports as implemented is run twice — once with no input at
 * all, once with its schema defaults/example (or the tool's own placeholder for a
 * free-text tool). Neither run may throw and neither may produce a blank result: an
 * invalid input has to surface a friendly message in the output panel, not an empty
 * box. Live instruments are included too; `runTool` answers them with an explicit
 * "interactive" sentence rather than an empty string.
 *
 * The whole sweep is one test so a failure report lists every offending slug at once
 * instead of stopping at the first.
 */
const t = ((key: string) => key) as ToolTranslate;

type Failure = { slug: string; phase: "empty" | "example"; reason: string };

async function attempt(slug: string, input: string, fields: Record<string, string>): Promise<string | null> {
  try {
    const out = await runTool(slug, input, "default", t, { fields, files: [] });
    if (!out) return "returned no result object";
    if (typeof out.text !== "string" || out.text.trim().length === 0) {
      return `blank text (html=${Boolean(out.html)}, image=${Boolean(out.image)}, table=${Boolean(out.table)}, artifacts=${out.artifacts?.length ?? 0})`;
    }
    return null;
  } catch (error) {
    return `threw: ${error instanceof Error ? error.message : String(error)}`;
  }
}

describe("implemented tool sweep", () => {
  it("never throws and never shows a blank result", { timeout: 120000 }, async () => {
    const failures: Failure[] = [];

    for (const slug of [...IMPLEMENTED_TOOLS].sort()) {
      const blank = await attempt(slug, "", {});
      if (blank) failures.push({ slug, phase: "empty", reason: blank });

      const schema = getToolSchema(slug);
      const fields = { ...defaultFieldValues(slug), ...(schema?.example?.fields ?? {}) };
      const input = schema ? schema.example?.text ?? "" : toolPlaceholder(slug);
      const example = await attempt(slug, input, fields);
      if (example) failures.push({ slug, phase: "example", reason: example });
    }

    if (failures.length > 0) {
      const report = failures.map((item) => `  ${item.slug} [${item.phase}] ${item.reason}`).join("\n");
      throw new Error(`${failures.length} sweep failure(s):\n${report}`);
    }
    expect(IMPLEMENTED_TOOLS.size).toBeGreaterThan(0);
  });
});
