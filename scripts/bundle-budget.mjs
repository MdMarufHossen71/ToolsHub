/**
 * Bundle budget gate.
 *
 * Runs after `vite build` against `dist/public` and fails the build if:
 *   - any JS chunk exceeds MAX_CHUNK_BYTES (prevents a heavy dep sneaking into
 *     the entry chunk — `sql-formatter` alone is ~279 KB, `svgo` ~568 KB);
 *   - total JS exceeds MAX_TOTAL_BYTES;
 *   - the emitted `index.html` still references Google Fonts (regression gate
 *     for the Fontsource self-hosting — no third-party font request allowed);
 *   - no bundled font asset (woff2) is emitted.
 *
 * Worker bundles (`*.mjs`, currently only the pdf.js worker loaded via `?url`
 * for PDF-to-images) are reported separately: they are on-demand assets, never
 * part of the initial paint, so they do not count toward the chunk/total gates —
 * but they must stay visible here instead of silently bypassing the audit.
 *
 * Run with:  node scripts/bundle-budget.mjs
 * In CI:     corepack pnpm run budget
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist", "public");
const ASSETS = path.join(DIST, "assets");

const MAX_CHUNK_BYTES = 620 * 1024;
const MAX_TOTAL_BYTES = 6 * 1024 * 1024;

if (!existsSync(ASSETS)) throw new Error(`[budget] ${ASSETS} is missing — run this after \`vite build\``);

const jsFiles = readdirSync(ASSETS).filter((f) => f.endsWith(".js"));
if (jsFiles.length === 0) throw new Error("[budget] no JS chunks found in dist/public/assets");

// On-demand worker bundles (pdf.js via `?url`). Never initial paint, so gated
// separately by visibility, not by the chunk/total limits.
const workerFiles = readdirSync(ASSETS).filter((f) => f.endsWith(".mjs"));
for (const file of workerFiles) {
  const bytes = statSync(path.join(ASSETS, file)).size;
  console.log(`[budget] worker ${file} ${(bytes / 1024).toFixed(0)} KB (on-demand, excluded from chunk/total gates)`);
}

let total = 0;
let biggest = { name: "", bytes: 0 };
const over = [];
for (const file of jsFiles) {
  const bytes = statSync(path.join(ASSETS, file)).size;
  total += bytes;
  if (bytes > biggest.bytes) biggest = { name: file, bytes };
  if (bytes > MAX_CHUNK_BYTES) over.push({ name: file, bytes });
}

const indexHtml = path.join(DIST, "index.html");
if (!existsSync(indexHtml)) throw new Error("[budget] dist/public/index.html is missing");
const html = readFileSync(indexHtml, "utf8");
if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html)) {
  throw new Error("[budget] index.html references Google Fonts — fonts must stay self-hosted");
}

const allAssets = readdirSync(ASSETS);
const hasFont = allAssets.some((f) => /\.woff2?$/.test(f));
if (!hasFont) throw new Error("[budget] no bundled font asset (woff/woff2) found — Fontsource output missing?");

console.log(
  `[budget] ${jsFiles.length} JS chunks, total ${(total / 1024).toFixed(0)} KB, biggest ${biggest.name} ${(biggest.bytes / 1024).toFixed(0)} KB (limit ${(MAX_CHUNK_BYTES / 1024).toFixed(0)} KB)`,
);

if (over.length > 0) {
  throw new Error(
    `[budget] ${over.length} chunk(s) over budget: ${over.map((o) => `${o.name} ${(o.bytes / 1024).toFixed(0)} KB`).join(", ")}`,
  );
}
if (total > MAX_TOTAL_BYTES) {
  throw new Error(`[budget] total JS ${(total / 1024).toFixed(0)} KB exceeds ${(MAX_TOTAL_BYTES / 1024).toFixed(0)} KB`);
}
console.log("[budget] OK");
