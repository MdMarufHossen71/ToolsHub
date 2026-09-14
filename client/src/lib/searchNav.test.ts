import { describe, expect, it } from "vitest";
import { resolveSearchEnter, toolsSearchHref } from "./searchNav";

describe("search navigation", () => {
  it("builds the filtered tools URL from one shared definition", () => {
    expect(toolsSearchHref("json")).toBe("/tools?search=json");
    expect(toolsSearchHref("base64")).toBe("/tools?search=base64");
  });

  it("trims the query and percent-encodes it", () => {
    expect(toolsSearchHref("  json  ")).toBe("/tools?search=json");
    expect(toolsSearchHref("café & bar")).toBe("/tools?search=caf%C3%A9%20%26%20bar");
  });

  it("opens the highlighted tool on Enter", () => {
    expect(resolveSearchEnter("json", "json-formatter-validator")).toEqual({
      type: "open-tool",
      slug: "json-formatter-validator",
    });
  });

  it("submits a non-empty query when nothing is highlighted", () => {
    expect(resolveSearchEnter("json", null)).toEqual({ type: "submit" });
    expect(resolveSearchEnter("  json  ", null)).toEqual({ type: "submit" });
  });

  it("does nothing on Enter when the query is empty", () => {
    expect(resolveSearchEnter("", null)).toEqual({ type: "none" });
    expect(resolveSearchEnter("   ", null)).toEqual({ type: "none" });
  });
});
