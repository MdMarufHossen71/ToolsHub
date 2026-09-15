// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { runTool } from "@/lib/toolOperations";

const t = ((key: string) => key) as Parameters<typeof runTool>[3];

describe("markdown sanitize (strict-CSP contract)", () => {
  it("strips style attributes so preview output never needs style-src unsafe-inline", async () => {
    const out = await runTool("markdown-to-html", '<span style="color:red">hi</span>', "default", t);
    expect(out.error).toBeFalsy();
    expect(out.html ?? "").not.toContain("style=");
    expect(out.html ?? "").toContain("hi");
  });

  it("keeps safe markup intact", async () => {
    const out = await runTool("markdown-to-html", "# Hello", "default", t);
    expect(out.error).toBeFalsy();
    expect(out.html ?? "").toContain("<h1>");
  });
});
