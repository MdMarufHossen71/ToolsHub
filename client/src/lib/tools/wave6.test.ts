import { describe, expect, it } from "vitest";
import { runTool, type ToolTranslate } from "../toolOperations";
import { getToolSchema } from "../toolSchemas";

const t = ((key: string) => key) as ToolTranslate;
const run = (slug: string, fields: Record<string, string>, input = "") =>
  runTool(slug, input, "default", t, { fields });

describe("Wave 6 friendly-result tables", () => {
  it("word-counter and case-converter ship copyable tables", async () => {
    const counter = await run("word-counter", {}, "hello hello world");
    expect(counter.table?.head).toEqual(["Word", "Count"]);
    expect(counter.table?.rows[0]).toEqual(["hello", "2"]);
    const casing = await run("case-converter", {}, "hi");
    expect(casing.table?.head).toEqual(["Style", "Text"]);
    expect(casing.table?.rows.length).toBeGreaterThan(5);
  });

  it("calculators answer in tables", async () => {
    const bmi = await run("bmi-calculator", {}, "70 175");
    expect(bmi.table?.rows[0]?.[0]).toBe("BMI");
    const age = await run("age-calculator", { dob: "2000-01-01" });
    expect(age.table?.head).toEqual(["Measure", "Value"]);
    const tip = await run("tip-calculator", { bill: "100", percent: "10", people: "2" });
    expect(tip.table?.rows[2]?.[1]).toBe("55.00");
    const url = await run("url-parser", {}, "https://example.com/p?a=1#h");
    expect(url.table?.rows[0]).toEqual(["Protocol", "https:"]);
  });

  it("data tools preview tables and density ranks", async () => {
    const csv = await run("json-to-csv-tsv", { text: '[{"a":"1","b":"2"}]', mode: "csv" });
    expect(csv.table?.head).toEqual(["a", "b"]);
    const back = await run("csv-converter", { text: "a,b\n1,2", mode: "json" });
    expect(back.table?.head).toEqual(["a", "b"]);
    const density = await run("keyword-density-analyzer", {}, "apple banana apple");
    expect(density.table?.rows[0]).toEqual(["apple", "2", "66.7%"]);
    const strength = await run("password-strength-analyzer", { text: "abc" });
    expect(strength.table?.rows[0]?.[0]).toBe("Strength");
    const contrast = await run("contrast-checker", { a: "#000000", b: "#ffffff" });
    expect(contrast.table?.rows[0]).toEqual(["Contrast ratio", "21.00 : 1"]);
    expect(contrast.image).toMatch(/^data:image\/svg/);
  });

  it("visual parameters use sliders with bounds", async () => {
    for (const slug of ["image-compressor", "lighten-darken-color", "color-blender", "blur-sharpen"]) {
      const schema = getToolSchema(slug);
      expect(schema).not.toBeNull();
    }
    const quality = getToolSchema("image-compressor")?.fields.find((field) => field.key === "quality");
    expect(quality?.type).toBe("range");
    expect(quality?.min).toBe("1");
    const angle = getToolSchema("gradient-generator")?.fields.find((field) => field.key === "angle");
    expect(angle?.type).toBe("range");
    expect(angle?.max).toBe("360");
  });
});
