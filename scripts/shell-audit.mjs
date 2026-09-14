/**
 * Semantic-HTML audit over every generated shell.
 *
 * `scripts/generate-seo.mjs` writes a static page per clean path; this script reads
 * them all back and asserts the things a crawler or an assistive technology needs:
 * a `<title>`, a meta description, a canonical link, a `lang`, exactly one `<h1>`,
 * no skipped heading levels, and — for a tool or game shell — a JSON-LD block that
 * parses as JSON. It checks every file, not a sample.
 *
 * Run with:  node scripts/shell-audit.mjs   (after a build)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist", "public");
const INDEX = path.join(DIST, "index.html");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "index.html") out.push(full);
  }
  return out;
}

const problems = [];
const fail = (file, message) => problems.push(`${path.relative(DIST, file).replace(/\\/g, "/")}: ${message}`);

const files = walk(DIST).filter((file) => file !== INDEX);
if (files.length === 0) {
  console.error("No generated shells found under dist/public — run a build first.");
  process.exit(1);
}

let jsonLdChecked = 0;
for (const file of files) {
  const html = readFileSync(file, "utf8");
  const relative = path.relative(DIST, file).replace(/\\/g, "/");

  if (!/<title>[^<]+<\/title>/.test(html)) fail(file, "missing or empty <title>");
  if (!/<html[^>]*\blang="[a-z-]+"/i.test(html)) fail(file, "missing lang on <html>");
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail(file, "missing meta description");
  if (!/<link rel="canonical" href="https:\/\/[^"]+"/.test(html)) fail(file, "missing canonical link");
  if (!/<meta property="og:url"/.test(html)) fail(file, "missing og:url");
  if (!/<meta name="twitter:card" content="summary_large_image"/.test(html)) fail(file, "missing twitter:card");

  const h1Count = (html.match(/<h1\b/g) ?? []).length;
  if (h1Count !== 1) fail(file, `expected exactly one <h1>, found ${h1Count}`);

  const levels = [...html.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
  if (levels[0] !== 1) fail(file, "first heading is not an <h1>");
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] > levels[i - 1] + 1) fail(file, `heading level jumps from h${levels[i - 1]} to h${levels[i]}`);
  }

  // Tool and game shells must carry structured data; section shells intentionally do not.
  const needsJsonLd = /^(tools|games)\/[^/]+\/index\.html$/.test(relative);
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  if (needsJsonLd) {
    if (scripts.length !== 1) fail(file, `expected one JSON-LD block, found ${scripts.length}`);
    for (const payload of scripts) {
      try {
        JSON.parse(payload);
        jsonLdChecked += 1;
      } catch (error) {
        fail(file, `JSON-LD does not parse: ${error.message}`);
      }
    }
  }
}

// The sitemap must agree with what was actually written.
const sitemapPath = path.join(DIST, "sitemap.xml");
if (!statSync(sitemapPath, { throwIfNoEntry: false })) {
  fail(sitemapPath, "missing sitemap.xml");
} else {
  const sitemap = readFileSync(sitemapPath, "utf8");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expectedShells = locs.filter((url) => url !== "https://tools-hub-71.vercel.app/").length;
  if (expectedShells !== files.length) fail(sitemapPath, `lists ${expectedShells} shell URLs but ${files.length} shells were written`);
}

console.log(`Checked ${files.length} generated shell(s) for semantic HTML; ${jsonLdChecked} JSON-LD block(s) parsed.`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n`);
  for (const problem of problems) console.log(`  ${problem}`);
  process.exit(1);
}
console.log("Every shell is semantic, documented and structurally sound.");
