import { describe, expect, it } from "vitest";
import { runTool } from "@/lib/toolOperations";

const t = ((key: string) => key) as Parameters<typeof runTool>[3];

describe("unicode-safe tool transforms", () => {
  it("reverse-text keeps emoji intact (surrogate pairs)", async () => {
    expect((await runTool("reverse-text", "a😀b", "default", t)).text).toBe("b😀a");
  });

  it("reverse-text lines mode handles CRLF", async () => {
    expect((await runTool("reverse-text", "a\r\nb", "lines", t)).text).toBe("b\na");
  });

  it("text-to-ascii reports one code point for emoji", async () => {
    expect((await runTool("text-to-ascii", "A", "default", t)).text).toBe("65");
    // U+1F600 = 128512. The old charCodeAt implementation returned "55357 56832".
    expect((await runTool("text-to-ascii", "😀", "default", t)).text).toBe("128512");
  });

  it("text-to-binary / hex are code-point aware", async () => {
    expect((await runTool("text-to-binary", "A", "default", t)).text).toBe("01000001");
    expect((await runTool("text-to-hex", "A", "default", t)).text).toBe("41");
    expect((await runTool("text-to-hex", "😀", "default", t)).text).toBe("1f600");
  });

  it("text-to-unicode reports U+1F600 for emoji", async () => {
    const out = await runTool(
      "text-to-unicode",
      "😀",
      "default",
      t,
      { fields: { text: "😀" } },
    );
    expect(out.text).toBe("U+1F600");
  });

  it("zalgo preserves the emoji base character", async () => {
    const out = await runTool(
      "zalgo-text-generator",
      "😀",
      "default",
      t,
      { fields: { text: "😀", mode: "mini" } },
    );
    expect(out.text.startsWith("😀")).toBe(true);
    expect(Array.from(out.text).length).toBeGreaterThan(1);
  });

  it("string-obfuscator counts emoji as one character", async () => {
    const out = await runTool(
      "string-obfuscator",
      "x",
      "default",
      t,
      { fields: { text: "😀😀😀😀😀", visible: "2" } },
    );
    // 5 emoji, 2 visible each side => 2 + 1 bullet + 2
    expect(out.text).toBe(`😀😀•😀😀`);
  });
});
