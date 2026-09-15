/** Cobalt Workshop design reminder: results are immediate, useful, and soberly formatted; never simulate a server or collect an input. */
import { v4 as uuidv4 } from "uuid";
import { ulid } from "ulid";
import { nanoid } from "nanoid";
import { MathError, evaluateExpression, formatNumber } from "@/lib/safeMath";
import type { TranslationKey } from "@/i18n/translations";
import { runTextTools } from "@/lib/tools/textTools";
import { runMathTools } from "@/lib/tools/mathTools";
import { runTimeTools } from "@/lib/tools/timeTools";
import { runSeoTools } from "@/lib/tools/seoTools";
import { runMiscTools } from "@/lib/tools/miscTools";
import { runCryptoTools } from "@/lib/tools/cryptoTools";
import { runDataTools } from "@/lib/tools/dataTools";
import { runColorTools } from "@/lib/tools/colorTools";
import { runRandomTools } from "@/lib/tools/randomTools";
import { runFileTools } from "@/lib/tools/fileTools";
import { runImageTools } from "@/lib/tools/imageTools";
import { isLiveTool } from "@/lib/liveSlugs";
import { IMPLEMENTED_TOOLS } from "@/lib/implementedTools";

/**
 * Heavy parsers load on demand, not with the tool catalogue. Each dynamic
 * `import()` becomes its own chunk that downloads only when a tool needing
 * it actually runs — `sql-formatter` alone is ~279 KB minified. The tiny id
 * generators above stay static; they cost almost nothing.
 */
const loadSqlFormatter = () => import("sql-formatter");
const loadYaml = () => import("js-yaml");
const loadXml = () => import("fast-xml-parser");
const loadToml = () => import("toml");
const loadMarkdown = () => import("marked");
const loadSanitizer = () => import("dompurify");

const morse: Record<string, string> = { a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..", "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.", ".": ".-.-.-", ",": "--..--", "?": "..--..", "!": "-.-.--" };
const nato: Record<string, string> = { a: "Alfa", b: "Bravo", c: "Charlie", d: "Delta", e: "Echo", f: "Foxtrot", g: "Golf", h: "Hotel", i: "India", j: "Juliett", k: "Kilo", l: "Lima", m: "Mike", n: "November", o: "Oscar", p: "Papa", q: "Quebec", r: "Romeo", s: "Sierra", t: "Tango", u: "Uniform", v: "Victor", w: "Whiskey", x: "X-ray", y: "Yankee", z: "Zulu" };

const textToSlug = (input: string) => input.toLowerCase().trim().replace(/[’'"`]/g, "").replace(/[^a-z0-9ঀ-৿]+/g, "-").replace(/(^-|-$)/g, "");
const toCamel = (input: string) => input.toLowerCase().replace(/(?:^|[\s_-]+)(\w)/g, (_m, letter) => letter.toUpperCase()).replace(/^\w/, (letter) => letter.toLowerCase());
const words = (input: string) => input.match(/[A-Za-z0-9ঀ-৿']+/g) ?? [];
const escapeHtml = (input: string) => input.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
const reverseMorse = Object.fromEntries(Object.entries(morse).map(([key, value]) => [value, key]));

/** Uniform integer in [0, bound) from `crypto`, with rejection sampling so the range is unbiased. */
function randomInt(bound: number) {
  if (bound <= 0) return 0;
  const limit = Math.floor(2 ** 32 / bound) * bound;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % bound;
  }
}

/** Fisher-Yates. The previous `sort(() => random - 0.5)` comparator was biased and not a valid ordering. */
function shuffle<T>(items: T[]): T[] {
  const output = items.slice();
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

/**
 * Unicode-safe Base64 encode without the deprecated `unescape` idiom.
 * Chunked so a large input cannot blow the argument-length limit.
 */
export function base64EncodeUnicode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    for (let j = i; j < end; j += 1) binary += String.fromCharCode(bytes[j]);
  }
  return btoa(binary);
}

/** Hex-encode a digest buffer. */
function hexOf(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash tools run through Web Crypto (`crypto.subtle`), not the unmaintained
 * `crypto-js` bundle. SHA-256/384/512 + SHA-1 are available there; MD5, SHA3
 * and RIPEMD-160 are intentionally dropped — MD5/SHA-1 are broken for security
 * and must never be presented as password storage, and SHA3 is not in WebCrypto.
 *
 * Every tool resolves through the single async `runTool` below (heavy parser
 * chunks download on first use), so callers never branch on sync-vs-async.
 */

export async function digestText(algorithm: string, text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const out = await crypto.subtle.digest(algorithm, data);
  return hexOf(out);
}

/** Largest file we will hash in-browser (50 MB). Larger picks are rejected with a localized error. */
export const MAX_FILE_HASH_BYTES = 50 * 1024 * 1024;

/**
 * Translator injected by the caller so result prose can be localized. Falls back
 * to English when the function is used outside React (tests, direct calls).
 */
export type ToolTranslate = (key: TranslationKey, values?: Record<string, string | number>) => string;

const englishFallback: Record<string, string> = {
  "tool.result.stats": "Live statistics",
  "tool.result.preview": "Sanitized preview HTML",
  "tool.result.needsInput": "Add an input to see an immediate, browser-only result.",
  "tool.result.interactive": "This tool is interactive—use the controls on this page to see it work.",
  "tool.result.empty": "That input produced nothing to show. Check it and try again.",
  "tool.result.imageReady": "Image ready. Use Download to save it.",
  "tool.result.filesReady": "File ready. Use Download to save it.",
  "tool.result.notesHint": "Your notes stay in this browser on this device.",
  "tool.result.signaturePresent": "Present — not verified locally",
  "tool.result.signatureMissing": "Missing",
  "tool.bmi.underweight": "Underweight",
  "tool.bmi.healthy": "Healthy range",
  "tool.bmi.overweight": "Overweight",
  "tool.bmi.obese": "Obesity range",
  "tool.error.generic": "Check the input and try again.",
  "tool.error.octal": "Enter a valid octal mode, for example 755.",
  "tool.error.hex": "Enter a 6-digit HEX colour, for example #3264FF.",
  "tool.error.jwt": "Enter a token in header.payload.signature form.",
  "tool.error.number": "Enter one or two numbers separated by a space or comma.",
  "tool.error.math.badChar": "Only numbers, operators and known function names are allowed.",
  "tool.error.math.badSyntax": "The expression is incomplete or has an unmatched bracket.",
  "tool.error.math.unknownName": "Unknown function or constant name.",
  "tool.error.math.badArgs": "That function was given the wrong number of arguments.",
  "tool.error.math.notFinite": "The result is not a finite number.",
  "tool.error.math.tooLong": "The expression is too long.",
  "tool.error.fileTooLarge": "That file is too large to hash in the browser (max 50 MB).",
  "tool.file.choose": "Choose file",
  "tool.file.selected": "Selected file: {name} ({size})",
  "tool.file.hashNote": "Files are read only on this device to compute hashes. Nothing is uploaded.",
  "tool.file.noFile": "Choose a file to compute its SHA hashes locally.",
  "tool.hash.note": "Hashes are computed locally with Web Crypto. MD5/SHA-1 are checksums only — never use them to store passwords.",
  "tool.private.note": "Private keys never leave this browser. Nothing is uploaded or stored.",
  "tool.live.lap": "Lap", "tool.live.wpm": "WPM", "tool.live.accuracy": "Accuracy",
  "tool.live.wait": "Wait for green…", "tool.live.tapNow": "TAP!", "tool.live.tooSoon": "Too soon — wait for green.",
  "tool.live.winner": "Winner", "tool.live.spin": "Spin", "tool.live.pressKey": "Press any key…",
  "tool.live.allow": "Allow access to continue.", "tool.live.options": "Options",
  "tool.live.text": "Text", "tool.live.emoji": "Emoji", "tool.live.minutes": "Minutes", "tool.live.work": "Focus", "tool.live.measure": "Measure", "tool.live.fullscreenNote": "Press Esc to leave.", "tool.live.board": "Drawing board", "tool.live.ruler": "Measuring ruler", "tool.live.workload": "Workload", "tool.live.opsSec": "ops/sec", "tool.live.batchMs": "batch ms", "tool.live.bold": "Bold", "tool.live.italic": "Italic", "tool.live.list": "Bulleted list", "tool.live.link": "Insert link", "tool.live.linkUrl": "Link URL", "tool.live.preview": "Preview", "tool.live.stop": "Stop", "tool.live.format": "Format", "home.recent": "Recently used", "home.recentCopy": "Jump back in where you left off.",
};

const identity: ToolTranslate = (key) => englishFallback[key] ?? key;

export type ToolResult = {
  text: string;
  html?: string;
  /** Already-localized caption for the output panel. */
  label?: string;
  /** Set when the result describes a failure rather than a value. */
  error?: boolean;
  /** Set when the tool has no implementation yet. */
  unavailable?: boolean;
  /** Data-URL preview (charts, swatches, generated images). */
  image?: string;
  /** Tabular data rendered as a real table, not monospaced text. */
  table?: { head: string[]; rows: string[][] };
  /** Downloadable files (images, PDFs, ZIPs) as data URLs. */
  artifacts?: Array<{ name: string; mime: string; dataUrl: string }>;
};

/** Named form values + picked files for schema-driven tools. */
export type ToolExtra = {
  fields?: Record<string, string>;
  files?: File[];
};

/** Read a named field with a fallback. Branches stay one-liners. */
export function field(extra: ToolExtra | undefined, key: string, fallback = ""): string {
  const value = extra?.fields?.[key];
  return value === undefined || value === "" ? fallback : value;
}

/** Thrown by a tool branch to surface a localized, specific reason. */
export class ToolError extends Error {
  readonly key: TranslationKey;
  constructor(key: TranslationKey) {
    super(key);
    this.name = "ToolError";
    this.key = key;
  }
}

/** Signature every wave-runner module implements. */
export type ToolRunner = (
  slug: string,
  input: string,
  option: string,
  t: ToolTranslate,
  extra: ToolExtra | undefined,
) => Promise<ToolResult | null>;

export async function runHashText(input: string, t: ToolTranslate = identity): Promise<ToolResult> {
  if (!input.trim()) return { text: t("tool.result.needsInput") };
  if (!crypto.subtle) return { text: t("tool.error.generic"), error: true };
  try {
    const [sha1, sha256, sha384, sha512] = await Promise.all([
      digestText("SHA-1", input),
      digestText("SHA-256", input),
      digestText("SHA-384", input),
      digestText("SHA-512", input),
    ]);
    return {
      text: JSON.stringify({ SHA1: sha1, SHA256: sha256, SHA384: sha384, SHA512: sha512 }, null, 2),
      label: t("tool.hash.note"),
    };
  } catch {
    return { text: t("tool.error.generic"), error: true };
  }
}

export async function runHashFile(file: File, t: ToolTranslate = identity): Promise<ToolResult> {
  if (file.size > MAX_FILE_HASH_BYTES) return { text: t("tool.error.fileTooLarge"), error: true };
  if (!crypto.subtle) return { text: t("tool.error.generic"), error: true };
  try {
    const data = await file.arrayBuffer();
    const [sha1, sha256, sha384, sha512] = await Promise.all([
      crypto.subtle.digest("SHA-1", data).then(hexOf),
      crypto.subtle.digest("SHA-256", data).then(hexOf),
      crypto.subtle.digest("SHA-384", data).then(hexOf),
      crypto.subtle.digest("SHA-512", data).then(hexOf),
    ]);
    return {
      text: JSON.stringify(
        { file: file.name, size: file.size, type: file.type || "unknown", SHA1: sha1, SHA256: sha256, SHA384: sha384, SHA512: sha512 },
        null,
        2,
      ),
      label: t("tool.hash.note"),
    };
  } catch {
    return { text: t("tool.error.generic"), error: true };
  }
}

/**
 * The implemented-tool set now lives in `@/lib/implementedTools`, a dependency-free
 * module the build-time shell generator can import under `--experimental-strip-types`.
 * Re-exported here so every existing importer keeps working unchanged.
 */
export { IMPLEMENTED_TOOLS };

export function isToolImplemented(slug: string) {
  return IMPLEMENTED_TOOLS.has(slug);
}

export function toolPlaceholder(slug: string) {
  if (slug.includes("json")) return '{\n  "hello": "world",\n  "tool": "ToolsHub"\n}';
  if (slug.includes("csv")) return "name,city\nAmina,Dhaka\nRahim,Chattogram";
  if (slug.includes("url")) return "https://example.com/path?source=tools#demo";
  if (slug.includes("markdown")) return "# Hello\n\nWrite **Markdown** and see the result.";
  if (slug.includes("sql")) return "select id,name from users where active=1 order by name;";
  if (slug.includes("color")) return "#3264FF";
  if (slug.includes("calculator") || slug.includes("math")) return "(12.5 * 4) / 2";
  if (slug.includes("email")) return "hello.name+news@gmail.com";
  return "Paste or type something here…";
}

/**
 * The single tool dispatcher. Kept separate from the exported `runTool` so the
 * exported entry point can post-process every result in one place (see
 * `ensureUsable`) without changing any branch's logic.
 */
async function dispatchTool(slug: string, input: string, option = "default", t: ToolTranslate = identity, extra?: ToolExtra): Promise<ToolResult> {
  const clean = input.trim();

  if (!isToolImplemented(slug)) return { text: "", unavailable: true };

  try {
    if (slug === "word-counter") {
      const tokens = words(input); const frequency = Object.entries(tokens.reduce<Record<string, number>>((memo, word) => { const key = word.toLowerCase(); memo[key] = (memo[key] ?? 0) + 1; return memo; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 12);
      return { text: JSON.stringify({ words: tokens.length, characters: input.length, charactersNoSpace: input.replace(/\s/g, "").length, lines: input ? input.split(/\r?\n/).length : 0, bytes: new TextEncoder().encode(input).length, readingMinutes: Number((tokens.length / 200).toFixed(2)), speakingMinutes: Number((tokens.length / 130).toFixed(2)), topWords: Object.fromEntries(frequency) }, null, 2), label: t("tool.result.stats") };
    }
    if (slug === "case-converter") {
      const title = input.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
      return { text: JSON.stringify({ UPPERCASE: input.toUpperCase(), lowercase: input.toLowerCase(), "Title Case": title, camelCase: toCamel(input), snake_case: textToSlug(input).replace(/-/g, "_"), "kebab-case": textToSlug(input), "Alternating cAsE": Array.from(input).map((char, index) => index % 2 ? char.toLowerCase() : char.toUpperCase()).join("") }, null, 2) };
    }
    // `Array.from` (not `split("")`) keeps surrogate pairs / emoji intact when reversing.
    if (slug === "reverse-text") return { text: option === "words" ? input.split(/(\s+)/).reverse().join("") : option === "lines" ? input.split(/\r?\n/).reverse().join("\n") : Array.from(input).reverse().join("") };
    if (slug === "remove-extra-whitespaces") return { text: input.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim() };
    if (slug === "remove-empty-lines") return { text: input.split("\n").filter((line) => line.trim()).join("\n") };
    if (slug === "remove-line-breaks") return { text: input.replace(/\s*\n\s*/g, " ") };
    if (slug === "remove-duplicate-lines") return { text: input.split("\n").filter((line, index, lines) => lines.indexOf(line) === index).join("\n") };
    if (slug === "sort-list") return { text: input.split("\n").filter(Boolean).sort((a, b) => option === "desc" ? b.localeCompare(a) : a.localeCompare(b, undefined, { numeric: true })).join("\n") };
    if (slug === "list-randomizer" || slug === "string-shuffler") return { text: shuffle(input.split("\n")).join("\n") };
    if (slug === "slug-generator") return { text: textToSlug(input) };
    if (slug === "text-to-nato-alphabet") return { text: Array.from(input).map((char) => nato[char.toLowerCase()] ?? char).join(" ") };
    // Code-point aware: `Array.from` + `codePointAt` keep emoji as one unit instead of
    // splitting surrogate halves into two garbage numbers.
    if (slug === "text-to-ascii") return { text: Array.from(input).map((char) => char.codePointAt(0) ?? 0).join(" ") };
    if (slug === "text-to-binary") return { text: Array.from(input).map((char) => (char.codePointAt(0) ?? 0).toString(2).padStart(8, "0")).join(" ") };
    if (slug === "text-to-hex") return { text: Array.from(input).map((char) => (char.codePointAt(0) ?? 0).toString(16).padStart(2, "0")).join(" ") };
    if (slug === "morse-code") {
      const isMorse = /^[.\-/\s]+$/.test(clean);
      return { text: isMorse ? input.split(" / ").map((word) => word.split(" ").map((code) => reverseMorse[code] ?? "?").join("")).join(" ") : input.toLowerCase().split(" ").map((word) => word.split("").map((char) => morse[char] ?? char).join(" ")).join(" / ") };
    }
    if (slug === "rot13-caesar-cipher") return { text: input.replace(/[a-z]/gi, (char) => String.fromCharCode((char <= "Z" ? 65 : 97) + (char.charCodeAt(0) - (char <= "Z" ? 65 : 97) + 13) % 26)) };
    if (slug === "base64-text") return { text: option === "decode" ? new TextDecoder().decode(Uint8Array.from(atob(input), (char) => char.charCodeAt(0))) : base64EncodeUnicode(input) };
    if (slug === "url-encode-decode") return { text: option === "decode" ? decodeURIComponent(input) : encodeURIComponent(input) };
    if (slug === "html-entities") return { text: option === "unescape" ? new DOMParser().parseFromString(input, "text/html").documentElement.textContent ?? "" : escapeHtml(input) };
    if (slug === "email-normalizer") { const [local, domain] = clean.toLowerCase().split("@"); return { text: domain === "gmail.com" ? `${local.split("+")[0].replace(/\./g, "")}@gmail.com` : `${local ?? ""}@${domain ?? ""}` }; }
    if (slug === "html-to-plain-text") return { text: new DOMParser().parseFromString(input, "text/html").body.textContent ?? "" };
    if (slug === "markdown-to-html" || slug === "markdown-editor") { const [{ marked }, { default: DOMPurify }] = await Promise.all([loadMarkdown(), loadSanitizer()]); const html = DOMPurify.sanitize(marked.parse(input) as string, { USE_PROFILES: { html: true } }); return { text: html, html, label: t("tool.result.preview") }; }
    // Hash tools resolve through Web Crypto (see `runHashText`); the file
    // variant is driven by `runHashFile` from the workspace's file flow.
    if (slug === "hash-generator") return runHashText(input, t);
    if (slug === "file-hash-calculator") return { text: t("tool.result.needsInput"), label: t("tool.hash.note") };
    if (slug === "uuid-generator") return { text: Array.from({ length: option === "bulk" ? 10 : 1 }, () => uuidv4()).join("\n") };
    if (slug === "ulid-generator") return { text: ulid() };
    if (slug === "nanoid-generator") return { text: nanoid() };
    if (slug === "secure-token-generator") { const bytes = crypto.getRandomValues(new Uint8Array(32)); return { text: Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("") }; }
    if (slug === "jwt-decoder-debugger") {
      const [header, payload, signature] = clean.split(".");
      if (!header || !payload) throw new ToolError("tool.error.jwt");
      const decode = (section: string) => {
        const normalized = section.replace(/-/g, "+").replace(/_/g, "/");
        try {
          return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), (char) => char.charCodeAt(0))));
        } catch {
          throw new ToolError("tool.error.jwt");
        }
      };
      return { text: JSON.stringify({ header: decode(header), payload: decode(payload), signature: signature ? t("tool.result.signaturePresent") : t("tool.result.signatureMissing") }, null, 2) };
    }
    if (slug === "json-formatter-validator") return { text: JSON.stringify(JSON.parse(input), null, 2) };
    if (slug === "json-minifier") return { text: JSON.stringify(JSON.parse(input)) };
    if (slug === "yaml-formatter") { const yaml = await loadYaml(); return { text: yaml.dump(yaml.load(input)) }; }
    if (slug === "toml-formatter") { const { default: toml } = await loadToml(); return { text: JSON.stringify(toml.parse(input), null, 2) }; }
    if (slug === "xml-formatter") { const { XMLBuilder, XMLParser } = await loadXml(); const parsed = new XMLParser({ ignoreAttributes: false }).parse(input); return { text: new XMLBuilder({ format: true, ignoreAttributes: false }).build(parsed) }; }
    if (slug === "yaml-json-toml-xml-converter") { const [yaml, { XMLBuilder }] = await Promise.all([loadYaml(), loadXml()]); const parsed = clean.startsWith("{") ? JSON.parse(input) : yaml.load(input); return { text: option === "xml" ? new XMLBuilder({ format: true }).build(parsed) : option === "yaml" ? yaml.dump(parsed) : JSON.stringify(parsed, null, 2) }; }
    if (slug === "sql-formatter") { const { format: formatSql } = await loadSqlFormatter(); return { text: formatSql(input) }; }
    if (slug === "url-parser") { const url = new URL(clean); return { text: JSON.stringify({ protocol: url.protocol, host: url.host, hostname: url.hostname, port: url.port, pathname: url.pathname, parameters: Object.fromEntries(url.searchParams), hash: url.hash }, null, 2) }; }
    if (slug === "keyword-density-analyzer") { const tokens = words(input); const counts = tokens.reduce<Record<string, number>>((memo, word) => { const key = word.toLowerCase(); memo[key] = (memo[key] ?? 0) + 1; return memo; }, {}); return { text: JSON.stringify(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([word, count]) => ({ word, count, percentage: `${((count / Math.max(tokens.length, 1)) * 100).toFixed(1)}%` })), null, 2) }; }
    if (slug === "chmod-calculator") { if (!/^[0-7]{3,4}$/.test(clean)) throw new ToolError("tool.error.octal"); const parts = clean.slice(-3).split("").map((digit) => [Number(digit) & 4 ? "r" : "-", Number(digit) & 2 ? "w" : "-", Number(digit) & 1 ? "x" : "-"].join("")); return { text: JSON.stringify({ octal: clean, symbolic: `${parts[0]}${parts[1]}${parts[2]}`, decimal: Number.parseInt(clean, 8) }, null, 2) }; }
    if (slug === "math-evaluator" || slug === "basic-calculator" || slug === "scientific-calculator") {
      // Parsed by a dedicated arithmetic evaluator; user input is never executed.
      try {
        return { text: formatNumber(evaluateExpression(clean)) };
      } catch (error) {
        if (error instanceof MathError) throw new ToolError(`tool.error.math.${error.code}` as TranslationKey);
        throw error;
      }
    }
    if (slug === "percentage-calculator") { const [x, y] = clean.split(/[ ,]+/).map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) throw new ToolError("tool.error.number"); return { text: JSON.stringify({ [`${x}% of ${y}`]: (x / 100) * y, [`${x} is what % of ${y}`]: y ? (x / y) * 100 : null, change: y ? ((x - y) / y) * 100 : null }, null, 2) }; }
    if (slug === "bmi-calculator") { const [weight, height] = clean.split(/[ ,]+/).map(Number); if (!Number.isFinite(weight) || !Number.isFinite(height) || height <= 0) throw new ToolError("tool.error.number"); const bmi = weight / (height / 100) ** 2; return { text: JSON.stringify({ bmi: Number(bmi.toFixed(1)), status: bmi < 18.5 ? t("tool.bmi.underweight") : bmi < 25 ? t("tool.bmi.healthy") : bmi < 30 ? t("tool.bmi.overweight") : t("tool.bmi.obese") }, null, 2) }; }
    if (slug === "random-number-generator") { const parsed = clean.split(/[ ,]+/).filter(Boolean).map(Number); if (parsed.some((value) => !Number.isFinite(value))) throw new ToolError("tool.error.number"); const [low = 1, high = 100] = parsed; const min = Math.min(low, high); const span = Math.abs(high - low) + 1; return { text: Array.from({ length: option === "bulk" ? 10 : 1 }, () => min + randomInt(span)).join("\n") }; }
    if (slug === "random-string-generator") { const length = Math.min(Math.max(Number(clean) || 16, 1), 512); const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; return { text: Array.from({ length }, () => chars[randomInt(chars.length)]).join("") }; }
    if (slug === "email-validator") return { text: JSON.stringify({ email: clean, valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) }, null, 2) };
    if (slug === "hex-rgb-hsl-hsv-converter" || slug === "color-picker") { const hex = clean.replace("#", ""); if (!/^[0-9a-f]{6}$/i.test(hex)) throw new ToolError("tool.error.hex"); const [r, g, b] = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)); return { text: JSON.stringify({ hex: `#${hex.toUpperCase()}`, rgb: `rgb(${r}, ${g}, ${b})`, decimal: { r, g, b } }, null, 2) }; }
    if (slug === "notes-pad") return { text: input, label: t("tool.result.notesHint") };
    // Wave runners: each returns a result or null when the slug is not theirs.
    // They throw ToolError like the branches above; the catch below localizes.
    for (const runner of [runTextTools, runMathTools, runTimeTools, runSeoTools, runMiscTools, runCryptoTools, runDataTools, runColorTools, runRandomTools, runFileTools, runImageTools]) {
      const result = await runner(slug, input, option, t, extra);
      if (result) return result;
    }
    // A live instrument has no request/response result — it renders its own UI in the
    // workspace. Return a real sentence rather than an empty string so `runTool` never
    // yields blank output for a slug the registry reports as implemented.
    if (isLiveTool(slug)) return { text: t("tool.result.interactive") };
    return { text: t("tool.error.generic"), error: true };
  } catch (error) {
    if (error instanceof ToolError) return { text: t(error.key), error: true };
    return { text: t("tool.error.generic"), error: true };
  }
}

/** Strip tags and entities so an HTML-only result can still offer readable text. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A table's rows flattened to text, used only when a tool returned no text of its own. */
function tableToText(table: NonNullable<ToolResult["table"]>): string {
  const lines = [table.head.join(" | "), ...table.rows.map((row) => row.join(" | "))];
  return lines.join("\n").trim();
}

/**
 * Guarantees a non-blank output panel for every implemented tool.
 *
 * A transform on empty input legitimately returns an empty string, and a few tools
 * build only a table, image or HTML fragment. Rendered raw that is either a blank box
 * or, for HTML, an empty element — both read as "broken". This turns each case into a
 * localized message or derives copy-ready text from the content that is already there.
 * It is the single reason the empty/error sweep can assert a non-empty string result.
 */
function ensureUsable(result: ToolResult, input: string, t: ToolTranslate): ToolResult {
  if (result.unavailable) return result;
  // Defensive: a runner that breaks its own type contract must not crash the panel.
  const text = typeof result.text === "string" ? result.text : "";
  if (text.trim().length > 0) return result;

  if (result.image) return { ...result, text: t("tool.result.imageReady") };
  if (result.artifacts && result.artifacts.length > 0) return { ...result, text: t("tool.result.filesReady") };

  // An empty input is not an error, so it gets the "add an input" nudge. A populated
  // input that still yields nothing falls through to the table/HTML summaries below.
  if (input.trim().length === 0) return { text: t("tool.result.needsInput"), label: result.label, error: result.error };

  if (result.table && result.table.rows.length > 0) return { ...result, text: tableToText(result.table) };
  if (result.html) {
    const readable = htmlToText(result.html);
    if (readable.length > 0) return { ...result, text: readable };
  }
  return { text: t("tool.result.empty"), label: result.label, error: result.error };
}

export async function runTool(slug: string, input: string, option = "default", t: ToolTranslate = identity, extra?: ToolExtra): Promise<ToolResult> {
  try {
    return ensureUsable(await dispatchTool(slug, input, option, t, extra), input, t);
  } catch {
    // `dispatchTool` already catches its own failures; this is a backstop for the
    // post-processing step, so the workspace's `.then()` can never see a rejection.
    return { text: t("tool.error.generic"), error: true };
  }
}
