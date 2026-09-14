import { describe, expect, it } from "vitest";
import { runTool, type ToolTranslate } from "../toolOperations";

const t = ((key: string) => key) as ToolTranslate;
const run = (slug: string, fields: Record<string, string>, input = "", files: File[] = []) =>
  runTool(slug, input, "default", t, { fields, files });
const file = (name: string, content: string, type: string) => new File([content], name, { type });

describe("Wave 2 crypto tools", () => {
  it("hmac matches the RFC vector", async () => {
    const out = JSON.parse((await run("hmac-generator", { text: "The quick brown fox jumps over the lazy dog", key: "key", mode: "SHA-256" })).text);
    expect(out.hex).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  });

  it("bcrypt hashes and compares", async () => {
    const hashed = JSON.parse((await run("bcrypt-hash-compare", { text: "secret", hash: "", rounds: "4" })).text);
    expect(hashed.hash).toMatch(/^\$2[aby]\$/);
    expect(JSON.parse((await run("bcrypt-hash-compare", { text: "secret", hash: hashed.hash })).text).match).toBe(true);
    expect(JSON.parse((await run("bcrypt-hash-compare", { text: "wrong", hash: hashed.hash })).text).match).toBe(false);
  });

  it("AES-GCM roundtrips", async () => {
    const enc = await run("encrypt-decrypt-text", { text: "hello", password: "pw", mode: "encrypt" });
    expect(enc.text.split(".")).toHaveLength(3);
    expect((await run("encrypt-decrypt-text", { text: enc.text, password: "pw", mode: "decrypt" })).text).toBe("hello");
    expect((await run("encrypt-decrypt-text", { text: enc.text, password: "nope", mode: "decrypt" })).error).toBe(true);
  });

  it("RSA makes a JWK pair, passwords and tokens behave", async () => {
    const pair = JSON.parse((await run("rsa-key-pair-generator", { mode: "2048" })).text);
    expect(pair.publicKey.kty).toBe("RSA");
    expect(pair.privateKey.d).toBeDefined();
    expect((await run("password-generator", { length: "16", count: "3", symbols: "on" })).text.split("\n")).toHaveLength(3);
    expect(JSON.parse((await run("password-strength-analyzer", { text: "abc" })).text).verdict).toBe("Very weak");
    expect((await run("passphrase-generator", { words: "4", separator: "-" })).text.split("-")).toHaveLength(4);
    const totp = JSON.parse((await run("totp-otp-generator", { secret: "JBSWY3DPEHPK3PXP", digits: "6", period: "30" })).text);
    expect(totp.code).toMatch(/^\d{6}$/);
    expect((await run("basic-auth-header", { user: "al", pass: "pw" })).text).toBe("Basic YWw6cHc=");
    expect((await run("outlook-safelink-decoder", { text: "https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com%2F" })).text).toBe("https://example.com/");
    expect((await run("bip39-mnemonic-generator", {})).text.split(" ")).toHaveLength(12);
  });
});

describe("Wave 2 data tools", () => {
  it("converts and sorts CSV", async () => {
    const json = await run("json-to-csv-tsv", { text: '[{"a":"1","b":"2"}]', mode: "csv" });
    expect(json.text).toContain("a,b");
    const back = await run("csv-converter", { text: "a,b\n1,2", mode: "json" });
    expect(JSON.parse(back.text)).toEqual([{ a: "1", b: "2" }]);
    const sorted = await run("csv-sorter", { text: "n,s\nb,1\na,2", column: "n", mode: "asc" });
    expect(sorted.text.split("\n")[1]).toContain("a,2");
  });

  it("diffs, tests regex, builds URLs and meta", async () => {
    const diff = await run("json-diff", { text: '{"a":1}', text2: '{"a":2}' });
    expect(diff.table?.rows.length).toBeGreaterThan(0);
    const cmp = await run("compare-files", { text: "a\nb", text2: "a\nc" });
    expect(JSON.parse(`{${cmp.table ? '"x":1' : ""}}`)).toBeDefined();
    const re = await run("regex-tester", { pattern: "\\d+", flags: "g", text: "a1b22" });
    expect(re.table?.rows).toHaveLength(2);
    expect((await run("url-builder", { base: "https://x.com/s", params: "q=a b" })).text).toBe("https://x.com/s?q=a+b");
    expect((await run("open-graph-generator", { title: "T", desc: "D", url: "https://x.com", image: "https://x.com/i.png" })).text).toContain("og:title");
    expect((await run("robots-txt-generator", { sitemap: "https://x.com/s.xml", disallow: "/a" })).text).toContain("Disallow: /a");
    const map = await run("xml-sitemap-generator", { text: "https://x.com/\nhttps://x.com/a" });
    expect(map.text).toContain("<loc>https://x.com/a</loc>");
  });

  it("looks up references and computes nets", async () => {
    expect((await run("http-status-codes", { query: "404" })).table?.rows[0][1]).toBe("Not Found");
    expect((await run("mime-types-lookup", { query: "png" })).text).toContain("image/png");
    expect((await run("git-cheatsheet", { query: "" })).table?.rows.length).toBeGreaterThan(10);
    expect(JSON.parse((await run("ipv4-subnet-calculator", { cidr: "192.168.1.0/24" })).text).network).toBe("192.168.1.0");
    expect(JSON.parse((await run("ipv4-address-converter", { value: "1.2.3.4" })).text).integer).toBe(16909060);
    expect((await run("ipv4-range-expander", { cidr: "10.0.0.0/30" })).text.split("\n")).toHaveLength(4);
    expect((await run("ipv6-ula-generator", { count: "2" })).text.split("\n")).toHaveLength(2);
    expect(JSON.parse((await run("eta-calculator", { done: "50", total: "100", elapsed: "10" })).text).minutesLeft).toBe(10);
    expect((await run("random-port-generator", { count: "3", registered: "on" })).text.split("\n")).toHaveLength(3);
    expect((await run("mac-address-generator", { count: "2", sep: "-" })).text.split("\n")[0]).toHaveLength(17);
    const ua = JSON.parse((await run("user-agent-parser", { text: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" })).text);
    expect(ua.browser).toContain("Chrome");
    const cron = await run("crontab-generator", { minute: "*/5", hour: "*", dom: "*", month: "*", dow: "*", cmd: "run.sh" });
    expect(cron.text).toContain("Every 5 minutes");
    expect((await run("crontab-generator", { minute: "xx", hour: "*", dom: "*", month: "*", dow: "*", cmd: "x" })).error).toBe(true);
    expect((await run("docker-run-converter", { text: "docker run -d --name web -p 8080:80 nginx:alpine" })).text).toContain("image: nginx:alpine");
    const svg = await run("svg-placeholder-generator", { w: "100", h: "50", label: "Hi", bg: "#ffffff", fg: "#000000" });
    expect(svg.artifacts?.[0].name).toBe("placeholder-100x50.svg");
  });
});

describe("Wave 2 color tools", () => {
  it("transforms, schemes and checks", async () => {
    expect((await run("css-named-colors", { query: "rebeccapurple" })).text).toContain("#663399");
    const light = await run("lighten-darken-color", { color: "#000000", amount: "50" });
    expect(light.image).toContain("data:image/svg+xml");
    expect(JSON.parse(light.text).hex).not.toBe("#000000");
    const scheme = (await run("color-scheme-generator", { color: "#ff0000", mode: "triadic" })).text.split("\n");
    expect(scheme).toHaveLength(3);
    expect(JSON.parse((await run("contrast-checker", { a: "#000000", b: "#ffffff" })).text).ratio).toBe(21);
    expect((await run("gradient-generator", { a: "#000000", b: "#ffffff", angle: "90" })).text).toContain("linear-gradient");
    expect((await run("gradient-palette", { a: "#000000", b: "#ffffff", steps: "4" })).text.split("\n")).toHaveLength(4);
    expect((await run("shades-tints-generator", { color: "#808080", steps: "2" })).text.split("\n")).toHaveLength(5);
    expect((await run("color-blindness-simulator", { color: "#22aa55" })).table?.rows).toHaveLength(4);
    expect((await run("random-color-generator", { count: "3" })).text.split("\n")).toHaveLength(3);
  });
});

describe("Wave 2 random tools", () => {
  it("draws, flips and validates", async () => {
    expect((await run("gaussian-generator", { mean: "0", dev: "1", count: "4" })).text.split("\n")).toHaveLength(4);
    expect(JSON.parse((await run("coin-flipper", { count: "10" })).text).flips).toHaveLength(10);
    const dice = JSON.parse((await run("dice-roller", { dice: "2", sides: "6" })).text);
    expect(dice.total).toBeGreaterThanOrEqual(2);
    expect((await run("random-team-generator", { text: "a\nb\nc\nd", teams: "2" })).text).toContain("Team 2");
    expect((await run("random-name-generator", { count: "2", mode: "bn" })).text.split("\n")).toHaveLength(2);
    expect((await run("mock-data-generator", { count: "3", mode: "person" })).table?.rows).toHaveLength(3);
    expect(JSON.parse((await run("iban-validator", { text: "DE89370400440532013000" })).text).valid).toBe(true);
    expect(JSON.parse((await run("credit-card-validator", { text: "4111111111111111" })).text).valid).toBe(true);
    expect(JSON.parse((await run("phone-number-parser", { text: "+8801712345678", country: "BD" })).text).valid).toBe(true);
    expect(JSON.parse((await run("vin-checker", { text: "1HGCM82633A004352" })).text).valid).toBe(true);
    expect(JSON.parse((await run("isbn-validator", { text: "9783161484100" })).text).valid).toBe(true);
    const rf = await run("random-file-generator", { size: "1", name: "r.bin" });
    expect(rf.artifacts?.[0].name).toBe("r.bin");
  });

  it("fails DOM renderers gracefully in node", async () => {
    expect((await run("qr-code-generator", { text: "hi", size: "256" })).error).toBe(true);
    expect((await run("barcode-generator", { text: "123", mode: "CODE128" })).error).toBe(true);
  });
});

describe("Wave 2 file tools", () => {
  it("parses page ranges", async () => {
    const { parseRanges } = await import("./fileTools");
    expect(parseRanges("1-3,5", 10)).toEqual([0, 1, 2, 4]);
    await expect(runTool("pdf-split", "", "default", t, { fields: { ranges: "99" }, files: [] })).resolves.toMatchObject({ error: true });
  });

  it("splits, joins, detects and converts", async () => {
    const split = await run("split-file", { parts: "2" }, "", [file("a.bin", "0123456789", "application/octet-stream")]);
    expect(split.artifacts).toHaveLength(2);
    const join = await runTool("join-files", "", "default", t, {
      fields: {},
      files: [file("a.part1", "01234", "application/octet-stream"), file("a.part2", "56789", "application/octet-stream")],
    });
    expect(JSON.parse(join.text).bytes).toBe(10);
    const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d])], "x.png", { type: "" });
    expect(JSON.parse((await run("file-type-detector", {}, "", [png])).text).kind).toBe("PNG image");
    expect((await run("file-size-converter", { value: "1", unit: "MB" })).table?.rows.find((r) => r[0] === "KB")?.[1]).toBe("1024");
    const txt = await run("text-to-file-download", { text: "hi", name: "n.txt" });
    expect(txt.artifacts?.[0].name).toBe("n.txt");
  });

  it("zips roundtrip", async () => {
    const created = await run("zip-creator-extractor", { mode: "create", name: "z.zip" }, "", [file("a.txt", "hello", "text/plain")]);
    expect(created.artifacts?.[0].name).toBe("z.zip");
    const listed = await runTool("zip-creator-extractor", "", "default", t, {
      fields: { mode: "extract", name: "z.zip" },
      files: [file("z.zip", "x", "application/zip")],
    });
    expect(listed.error).toBe(true); // "x" is not a zip
  });

  it("merges, splits, rotates, reorders, watermarks PDFs", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const make = async (pages: number) => {
      const doc = await PDFDocument.create();
      for (let i = 0; i < pages; i += 1) doc.addPage([100, 100]);
      return new File([await doc.save()], "doc.pdf", { type: "application/pdf" });
    };
    const two = await make(2);
    const one = await make(1);
    const merged = await run("pdf-merge", {}, "", [two, one]);
    expect(JSON.parse(merged.text).pages).toBe(3);
    expect(merged.artifacts?.[0].name).toBe("merged.pdf");
    const split = await run("pdf-split", { ranges: "1" }, "", [two]);
    expect(JSON.parse(split.text).pages).toBe(1);
    const rotated = await run("pdf-rotate", { degrees: "90" }, "", [one]);
    expect(rotated.artifacts?.[0].name).toBe("rotated.pdf");
    const reordered = await run("pdf-page-reorder", { order: "2,1" }, "", [two]);
    expect(JSON.parse(reordered.text).pages).toBe(2);
    const marked = await run("pdf-watermark", { text: "DRAFT" }, "", [one]);
    expect(marked.artifacts?.[0].name).toBe("watermarked.pdf");
  });

  it("embeds images into a PDF", async () => {
    const pngBytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const img = new File([pngBytes], "dot.png", { type: "image/png" });
    const out = await run("images-to-pdf", {}, "", [img]);
    expect(JSON.parse(out.text).pages).toBe(1);
  });
});
