import { describe, expect, it } from "vitest";
import { getToolSchema } from "./toolSchemas";
import { resolveInputMode } from "./toolInputMode";
import { runTool, type ToolTranslate } from "./toolOperations";

const t = ((key: string) => key) as ToolTranslate;
const run = (slug: string, fields: Record<string, string>) => runTool(slug, "", "default", t, { fields });

/**
 * Regression guard for the mis-nested-ternary defect: the workspace rendered a plain
 * textarea for every form tool, so the runner only ever saw its default fields and the
 * user's input was silently ignored. These probes call each runner directly with two
 * field sets and require the results to differ — if a form tool stops reading its
 * fields, the corresponding probe changes result no more and this test fails.
 *
 * Only deterministic, DOM/file-free form tools are probed. File and image tools need a
 * real `File`/canvas and reject in this node environment (see `tools/wave4.test.ts`), so
 * a field change there cannot be observed; randomised tools differ between runs no
 * matter the fields. Both categories are deliberately excluded rather than asserted on,
 * and listed in the repair report.
 */
const PROBES: Array<{ slug: string; base: Record<string, string>; changed: Record<string, string>; contains?: string }> = [
  { slug: "text-repeater", base: { text: "ha", count: "3", separator: "\n" }, changed: { text: "UNIQUEMARKER", count: "3", separator: "\n" }, contains: "UNIQUEMARKER" },
  { slug: "find-replace", base: { text: "hello world", find: "world", replace: "X" }, changed: { text: "hello world", find: "world", replace: "Y" } },
  { slug: "filter-lines", base: { text: "apple\nbanana\navocado", pattern: "av", mode: "keep" }, changed: { text: "apple\nbanana\navocado", pattern: "an", mode: "keep" } },
  { slug: "add-text-to-each-line", base: { text: "one\ntwo", prefix: "- ", suffix: "" }, changed: { text: "one\ntwo", prefix: "> ", suffix: "" } },
  { slug: "tabs-to-spaces", base: { text: "\tindented", spaces: "4" }, changed: { text: "\tindented", spaces: "2" } },
  { slug: "text-splitter", base: { text: "a,b,c", delimiter: "," }, changed: { text: "x,y,z", delimiter: "," } },
  { slug: "character-remover", base: { text: "Hello 123!", mode: "nondigits" }, changed: { text: "Hello 123!", mode: "digits" } },
  { slug: "area-calculator", base: { mode: "rect", a: "10", b: "5" }, changed: { mode: "rect", a: "20", b: "5" } },
  { slug: "rule-of-three", base: { a: "2", b: "5", c: "8" }, changed: { a: "4", b: "5", c: "8" } },
  { slug: "tip-calculator", base: { bill: "500", percent: "10", people: "2" }, changed: { bill: "1000", percent: "10", people: "2" } },
  { slug: "discount-calculator", base: { price: "1000", percent: "15" }, changed: { price: "2000", percent: "15" } },
  { slug: "number-base-converter", base: { value: "255", from: "10", to: "16" }, changed: { value: "16", from: "10", to: "16" } },
  { slug: "prime-checker-generator", base: { n: "97", mode: "check" }, changed: { n: "100", mode: "check" } },
  { slug: "temperature-converter", base: { value: "100", mode: "c-f" }, changed: { value: "0", mode: "c-f" } },
  { slug: "ipv4-subnet-calculator", base: { cidr: "192.168.1.0/24" }, changed: { cidr: "192.168.1.0/25" } },
  { slug: "url-builder", base: { base: "https://example.com/search", params: "q=hello\npage=1" }, changed: { base: "https://example.org/search", params: "q=hello\npage=1" } },
  { slug: "open-graph-generator", base: { title: "First", desc: "d", url: "https://example.com", image: "https://example.com/a.png" }, changed: { title: "Second", desc: "d", url: "https://example.com", image: "https://example.com/a.png" } },
  { slug: "hmac-generator", base: { text: "hello", key: "secret-a", mode: "SHA-256" }, changed: { text: "hello", key: "secret-b", mode: "SHA-256" } },
  { slug: "contrast-checker", base: { a: "#0a1025", b: "#f7f6f1" }, changed: { a: "#777777", b: "#f7f6f1" } },
  { slug: "gradient-generator", base: { a: "#3264ff", b: "#22d3ee", angle: "135" }, changed: { a: "#3264ff", b: "#22d3ee", angle: "45" } },
];

describe("form-mode runners read their fields", () => {
  it("only probes slugs the shared predicate calls a form", () => {
    const wrong = PROBES.filter(({ slug }) => resolveInputMode(slug, getToolSchema(slug)) !== "form").map(({ slug }) => slug);
    expect(wrong).toEqual([]);
  });

  it.each(PROBES)("$slug responds to a changed named field", async ({ slug, base, changed, contains }) => {
    const first = await run(slug, base);
    const second = await run(slug, changed);
    expect(first.error, `${slug} base errored: ${first.text}`).toBeFalsy();
    expect(second.error, `${slug} changed errored: ${second.text}`).toBeFalsy();
    expect(second.text, `${slug} ignored the changed field`).not.toBe(first.text);
    if (contains) expect(second.text).toContain(contains);
  });
});
