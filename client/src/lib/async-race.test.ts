import { describe, expect, it } from "vitest";
import { runTool, type ToolTranslate } from "@/lib/toolOperations";

const t = ((key: string) => key) as ToolTranslate;

describe("async tool execution", () => {
  it("concurrent runs resolve independently (no shared mutable result)", async () => {
    const first = runTool("reverse-text", "abc", "default", t);
    const second = runTool("reverse-text", "12345", "default", t);
    const [a, b] = await Promise.all([first, second]);
    expect(a.text).toBe("cba");
    expect(b.text).toBe("54321");
  });

  it("a slow heavy-parser run does not reject when overlapped", async () => {
    const slow = runTool("yaml-formatter", "hello: world", "default", t);
    const fast = runTool("reverse-text", "hi", "default", t);
    const [s, f] = await Promise.all([slow, fast]);
    expect(s.error).toBeFalsy();
    expect(f.text).toBe("ih");
  });
});
