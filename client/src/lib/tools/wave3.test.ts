import { describe, expect, it } from "vitest";
import { runTool, type ToolTranslate } from "../toolOperations";

const t = ((key: string) => key) as ToolTranslate;
const run = (slug: string, fields: Record<string, string>, input = "", files: File[] = []) =>
  runTool(slug, input, "default", t, { fields, files });

describe("Wave 3 text tools", () => {
  it("renders figlet art", async () => {
    const out = await run("ascii-art-text-generator", { text: "Hi", mode: "Standard" });
    expect(out.error).toBeFalsy();
    expect(out.text).toContain("_");
  });

  it("diffs two texts", async () => {
    const out = await run("text-diff-checker", { text: "a\nb", text2: "a\nc" });
    expect(out.table?.rows).toHaveLength(2);
  });
});

describe("Wave 3 data tools", () => {
  it("beautifies code", async () => {
    expect((await run("html-beautifier", { text: "<div><p>hi</p></div>" })).text).toContain("\n");
    expect((await run("css-beautifier-minifier", { text: "a{color:red}", mode: "beautify" })).text).toContain("\n");
    expect((await run("javascript-beautifier-minifier", { text: "function f(a){return a+1}", mode: "beautify" })).text).toContain("\n");
  });

  it("highlights without a browser", async () => {
    const out = await run("code-syntax-highlighter", { text: "const a = 1;", lang: "javascript" });
    expect(out.error).toBeFalsy();
    expect(out.text).toContain("const a = 1;");
  });

  it("validates JSON against a schema", async () => {
    const good = await run("json-schema-validator", { text: '{"age":30}', schema: '{"type":"object","properties":{"age":{"type":"number"}},"required":["age"]}' });
    expect(JSON.parse(good.text).valid).toBe(true);
    const bad = await run("json-schema-validator", { text: '{"age":"x"}', schema: '{"type":"object","properties":{"age":{"type":"number"}}}' });
    expect(JSON.parse(bad.text).valid).toBe(false);
  });

  // This case loads terser and html-minifier-terser and minifies three inputs, which
  // on a loaded machine can cross the 5s default even though the assertions pass. The
  // timeout is explicit so the test is not mistaken for a real failure; the work and
  // the assertions are unchanged.
  it("minifies html, css and js", async () => {
    expect((await run("html-minifier", { text: "<div>\n  <!-- c -->\n  <p>hi</p>\n</div>" })).text).not.toContain("<!--");
    expect((await run("css-minifier", { text: "a {\n  color: red;\n}" })).text).toBe("a{color:red}");
    expect((await run("js-minifier", { text: "function add(a, b) {\n  return a + b;\n}" })).text).not.toContain("\n");
  }, 20000);

  it("reads xlsx from a picked file", async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ a: 1 }]), "S");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const json = await run("xlsx-json-converter", { mode: "to-json" }, "", [new File([bytes], "s.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })]);
    expect(JSON.parse(json.text)).toEqual([{ a: 1 }]);
    const csv = await run("xlsx-json-converter", { mode: "to-csv" }, "", [new File([bytes], "s.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })]);
    expect(csv.text).toContain("a");
  });
});

describe("Wave 3 file tools", () => {
  it("optimizes svg and reports savings", async () => {
    const out = await run("svg-optimizer", { text: '<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="1" height="1"/></g></svg>' });
    expect(out.artifacts?.[0].name).toBe("optimized.svg");
    expect(out.label).toMatch(/→/);
  });

  it("reports exif gracefully", async () => {
    const png = new File([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0))], "dot.png", { type: "image/png" });
    const out = await run("exif-viewer", {}, "", [png]);
    // A tagless pixel yields either an explicit empty note or a small table —
    // both are honest; a throw is the only failure.
    const parsed = JSON.parse(out.text);
    expect(typeof parsed).toBe("object");
  });

  it("re-saves pdfs and declines render in node", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const pdf = new File([await doc.save()], "d.pdf", { type: "application/pdf" });
    const out = await run("compress-pdf", {}, "", [pdf]);
    expect(out.artifacts?.[0].name).toBe("compressed.pdf");
    expect(JSON.parse(out.text).after).toBeGreaterThan(0);
    expect((await run("pdf-to-images", { pages: "1" }, "", [pdf])).error).toBe(true);
  });
});
