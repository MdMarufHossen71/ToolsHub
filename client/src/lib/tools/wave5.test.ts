import { describe, expect, it } from "vitest";
import { runTool, type ToolTranslate } from "../toolOperations";

const t = ((key: string) => key) as ToolTranslate;
const run = (slug: string, fields: Record<string, string>, input = "") =>
  runTool(slug, input, "default", t, { fields });

describe("Wave 5 server-parity text utilities", () => {
  it("numbers lines, counts sentences, estimates reading time", async () => {
    expect((await run("line-numberer", { text: "a\nb", start: "1" })).text).toBe("1. a\n2. b");
    expect(JSON.parse((await run("sentence-counter", { text: "Hi. Bye!" })).text).sentences).toBe(2);
    const reading = JSON.parse((await run("reading-time", { text: "hello world" })).text);
    expect(reading.words).toBe(2);
    expect(reading.minutes).toBe(1);
  });

  it("extracts urls and restyles fancy text", async () => {
    expect((await run("url-extractor", { text: "see https://example.com/a and http://x.test" })).text).toContain("https://example.com/a");
    const bold = (await run("fancy-text", { text: "Hi", mode: "bold" })).text;
    expect(bold).not.toBe("Hi");
    expect(Array.from(bold)).toHaveLength(2);
  });

  it("parses query strings and escapes json", async () => {
    expect(JSON.parse((await run("query-string-parser", { text: "?a=1&b=two" })).text)).toEqual({ a: "1", b: "two" });
    expect(JSON.parse((await run("query-string-parser", { text: "https://example.com/?x=1" })).text)).toEqual({ x: "1" });
    expect((await run("json-escape", { text: 'a"b' })).text).toBe('"a\\"b"');
  });
});

describe("Wave 5 server-parity email utilities (honest, browser-local)", () => {
  it("builds gmail aliases with a non-account disclaimer", async () => {
    const out = (await run("gmail-alias-variations", { text: "Test.Name@gmail.com" })).text;
    expect(out).toContain("Aliases only");
    expect(out).toContain("testname@gmail.com");
  });

  it("advises on syntax without verifying mailboxes", async () => {
    const ok = JSON.parse((await run("email-syntax-advisor", { text: "a@b.com" })).text);
    expect(ok.syntax).toBe("format looks valid");
    expect(ok.limitation).toMatch(/does not verify/);
    const bad = JSON.parse((await run("email-syntax-advisor", { text: "not-an-email" })).text);
    expect(bad.syntax).toBe("needs review");
  });

  it("extracts, builds patterns, mailto links and signatures", async () => {
    expect((await run("email-extractor", { text: "write to a@x.com and b@y.org" })).text).toContain("a@x.com");
    const patterns = (await run("email-pattern-builder", { first: "arifa", last: "rahman", domain: "example.com" })).text;
    expect(patterns).toContain("Unverified");
    expect(patterns).toContain("arifa.rahman@example.com");
    expect((await run("mailto-link-builder", { to: "a@x.com", subject: "Hi", body: "Yo" })).text).toContain("mailto:a@x.com");
    const sig = (await run("email-signature-builder", { name: "A", title: "T", company: "C", phone: "P", website: "W" })).text;
    expect(sig).toContain("HTML:");
  });

  it("estimates size and advises on wording honestly", async () => {
    const size = JSON.parse((await run("email-size-estimator", { text: "hello" })).text);
    expect(size.utf8Bytes).toBe(5);
    expect(size.limitation).toMatch(/estimate only/);
    const spam = JSON.parse((await run("spam-wording-advisor", { text: "act now, free winner" })).text);
    expect(spam.flaggedPhrases.length).toBeGreaterThan(0);
    expect(spam.limitation).toMatch(/cannot predict/);
    const subject = JSON.parse((await run("subject-line-advisor", { subject: "Hi" })).text);
    expect(subject.characters).toBe(2);
    expect(subject.limitation).toMatch(/guidance only/);
  });
});
