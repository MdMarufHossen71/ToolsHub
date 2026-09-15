/**
 * Hardcoded user-facing text audit.
 *
 * The translation dictionary is meant to be the only source of user-facing prose. A
 * string typed straight into a component bypasses it silently: it typechecks, it
 * renders, and it shows English to a Bangla reader with nothing to flag it. This
 * catches the two ways that happens in JSX — text between tags, and a localizable
 * attribute given a literal instead of a `t(...)` call.
 *
 * Only files the application actually reaches are scanned. `client/src/components/ui`
 * carries the full shadcn set, most of which this app never renders; auditing dead
 * vendor files would bury the real findings. The reachable set is walked from
 * `main.tsx` through its imports, so a primitive becomes subject to the check the
 * moment something imports it.
 *
 * This is a text scan, not a parser. It is deliberately shallow so it stays cheap to
 * run and easy to read; `ALLOWED` below carries the handful of literals that are
 * correct as written, each with the reason.
 *
 * Run with:  node scripts/hardcoded-strings.mjs
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "client", "src");
const ENTRY = path.join(SRC, "main.tsx");

/** Attributes whose value is read out or shown to a person. */
const LOCALIZABLE_ATTRIBUTES = ["aria-label", "aria-description", "aria-roledescription", "aria-placeholder", "aria-valuetext", "placeholder", "title", "alt"];

/**
 * Literals that are correct as a literal. Matched case-sensitively against the
 * trimmed text.
 */
const ALLOWED = new Set([
  // Wordmark. The visible letters are `aria-hidden`; the link's accessible name comes
  // from `a11y.home`, so this is decoration and stays Latin in both locales.
  "TOOLS",
  "HUB",
  "GAMES",
  "BANGLADESH",
  "BD",
  // Language switch label. It is the name of the *other* language, written in that
  // language, which is what a reader needs to see on the button.
  "বাংলা",
  "English",
  // A download link's visible file-type suffix. It is a WebM container extension, not
  // prose, and the link's accessible name already comes from `common.download`.
  ".webm",
]);

/** Text with no prose in it: punctuation, separators, digits, single letters. */
function isProse(text) {
  if (!/\p{L}{2}/u.test(text)) return false;
  // A lone JSX entity or a bare symbol run.
  if (/^&[a-z]+;$/i.test(text)) return false;
  // The `>` … `<` pattern also spans a pair of comparison operators in ordinary
  // TypeScript, so `saved.length > 0 && saved.length < 64` reads as a text node. Any
  // of these means the match came from an expression rather than from JSX.
  if (/&&|\|\||===|!==|=>|\?\?|\.length|\(\)/.test(text)) return false;
  // A generic type argument list reads the same way: `{ dots: Set<number>; pellets:
  // Set<number> }` yields the "text" `; pellets: Set`. No JSX text node starts with a
  // statement separator or an assignment, so those matches are always type syntax.
  if (/^[;=]/.test(text)) return false;
  return true;
}

/**
 * Blanks every comment out of `source` while leaving string and template literals
 * intact. This is what keeps the text-node scan from reporting prose it reads out of a
 * doc comment (`a `<button>` inside an `<a>`` was the first false positive) or an
 * `aria-label="…"` written inside an example. Offsets and newlines are preserved, so
 * `lineAt` and the tag-position test still work against the original.
 *
 * Quotes are tracked so that a `//` inside a URL string is not mistaken for a comment.
 * A straight apostrophe inside JSX text would look like a string start; the codebase
 * writes those as `’`, so this stays a comment masker rather than a full parser.
 */
function maskComments(source) {
  const out = source.split("");
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];
    if (quote) {
      if (char === "\\") {
        i += 2;
        continue;
      }
      if (char === quote) quote = null;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      i += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        out[i] = " ";
        i += 1;
      }
      continue;
    }
    if (char === "/" && next === "*") {
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] !== "\n") out[i] = " ";
        i += 1;
      }
      if (i < source.length) {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
      }
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/** Resolves an import specifier to a file inside `client/src`, or null. */
function resolveImport(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;

  const candidates = [base, `${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every module reachable from the entry point, in discovery order. */
function reachableModules() {
  const seen = new Set();
  const queue = [ENTRY];
  const order = [];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    order.push(file);
    const source = readFileSync(file, "utf8");
    // The optional `(` picks up dynamic imports as well as static ones. The game
    // registry reaches every game module through `lazy(() => import("./snake"))`, so
    // without it the whole `client/src/games` tree — the shell, the coming-soon state
    // and each game — was outside the audit while the run still reported success.
    for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const resolved = resolveImport(match[1], file);
      if (resolved) queue.push(resolved);
    }
  }
  return order;
}

/**
 * True when the `>` at `index` really closes a JSX tag rather than being half of an
 * operator. A closing bracket always follows the last character of the tag — a letter,
 * a digit, a quote, a brace or a self-closing slash. An arrow function (`=>`), a
 * comparison (`axis > 0`) and a generic argument list all fail that test, and every one
 * of those was being reported as JSX text.
 */
function closesTag(source, index) {
  return TAG_END.test(source[index - 1] ?? "");
}

/** Line number of a character offset, 1-based. */
function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

// A regex literal, not `new RegExp(...)`: the string-built version lost the escape on
// the `]`, so the class closed early and the whole pattern became `<class-char>/]` —
// three characters that never appear where one is tested, which silently disabled the
// JSX text-node branch below while the run still printed success.
const TAG_END = /[A-Za-z0-9_"'}\]/]/;

const findings = [];

for (const file of reachableModules()) {
  if (!file.endsWith(".tsx")) continue;
  const source = readFileSync(file, "utf8");
  // Match against the comment-free copy so doc comments are never read as JSX; line
  // numbers still come from `source`, whose offsets this preserves exactly.
  const masked = maskComments(source);
  const relative = path.relative(ROOT, file).replace(/\\/g, "/");

  // Text between two tags, with no braces in it — an expression would mean the value
  // comes from somewhere else, and `t(...)` is the expected somewhere.
  for (const match of masked.matchAll(/>([^<>{}\n]+)</g)) {
    const text = match[1].trim();
    if (!text || !closesTag(masked, match.index) || !isProse(text) || ALLOWED.has(text)) continue;
    findings.push({ relative, line: lineAt(source, match.index), kind: "text", text });
  }

  for (const attribute of LOCALIZABLE_ATTRIBUTES) {
    const pattern = new RegExp(`${attribute}=(?:"([^"]*)"|'([^']*)')`, "g");
    for (const match of masked.matchAll(pattern)) {
      const text = (match[1] ?? match[2] ?? "").trim();
      if (!text || !isProse(text) || ALLOWED.has(text)) continue;
      findings.push({ relative, line: lineAt(source, match.index), kind: attribute, text });
    }
  }
}

const scanned = reachableModules().filter((file) => file.endsWith(".tsx")).length;
console.log(`Scanned ${scanned} reachable component file(s) for hardcoded user-facing text.`);

if (findings.length) {
  console.log(`\n${findings.length} hardcoded string(s) found:\n`);
  for (const { relative, line, kind, text } of findings) {
    console.log(`  ${relative}:${line}  [${kind}]  ${JSON.stringify(text.length > 70 ? `${text.slice(0, 70)}…` : text)}`);
  }
  console.log("\nMove each of these into client/src/i18n/translations.ts and read it with t().");
} else {
  console.log("No hardcoded user-facing text in any reachable component.");
}

process.exit(findings.length ? 1 : 0);
