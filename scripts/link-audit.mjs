/**
 * Internal-link and route-consistency audit over the built static output.
 *
 * A static hash-routed site has two link kinds and they fail differently:
 *
 *   - a clean path (`/tools/reverse-text/`) is a real directory the host must have
 *     emitted, so a missing one is a 404 for a crawler;
 *   - a hash route (`/#/tools/reverse-text`) is resolved by wouter at runtime, so a
 *     slug that no longer exists silently renders the in-app 404.
 *
 * This reads every `href`/`src` out of `dist/public`, resolves each to a file or a
 * route, and cross-checks the route table (`toolRegistry`, `gameRegistry`,
 * `SECTION_ROUTES`) against the shells and the sitemap. It is deterministic and has no
 * dependencies, so it is safe to run after a build.
 *
 * Run with:  node scripts/link-audit.mjs   (after `node scripts/generate-seo.mjs`)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { toolRegistry } from "../client/src/data/tools.ts";
import { gameRegistry } from "../client/src/data/games.ts";
import { SECTION_ROUTES } from "../client/src/lib/seo.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist", "public");

if (!existsSync(DIST)) {
  console.error("dist/public is missing — run `corepack pnpm run build` first.");
  process.exit(1);
}

// Routes wouter can resolve, read out of App.tsx so the router stays the source of
// truth. Dynamic segments are validated against the registries below.
const appSource = readFileSync(path.join(ROOT, "client", "src", "App.tsx"), "utf8");
const staticRoutes = new Set([...appSource.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]));
staticRoutes.add("/"); // the <Route path="/" …> is covered, this guards the fallback shape
const toolSlugs = new Set(toolRegistry.map((tool) => tool.slug));
const gameSlugs = new Set(gameRegistry.map((game) => game.slug));

const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);

/** True when a hash route resolves in the router for the current registries. */
function hashRouteResolves(hash) {
  const [pathPart] = hash.replace(/^#/, "").split("?");
  const segments = pathPart.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (segments.length === 0) return true;
  if (segments[0] === "tools") return segments.length === 1 || toolSlugs.has(segments[1]);
  if (segments[0] === "games") return segments.length === 1 || gameSlugs.has(segments[1]);
  return staticRoutes.has(`/${segments[0]}`);
}

/** True when a site path maps to a file the build emitted. */
function fileResolves(pathname) {
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  const base = clean ? path.join(DIST, clean) : DIST;
  const candidates = [base, `${base}.html`, `${base}.js`, `${base}.css`, path.join(base, "index.html")];
  return candidates.some((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function walkHtml(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkHtml(full, out);
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

const htmlFiles = walkHtml(DIST);
let checkedLinks = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const relative = path.relative(DIST, file).replace(/\\/g, "/") || "index.html";
  const dir = path.dirname(file);

  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const raw = match[1].trim();
    if (!raw || /^(?:[a-z]+:|\/\/|data:|#?$)/i.test(raw)) continue; // external, mailto:, data:, empty

    const [beforeHash, ...hashParts] = raw.split("#");
    const hash = hashParts.join("#");
    const pathPart = beforeHash.split("?")[0];

    if (pathPart) {
      const candidate = pathPart.startsWith("/") ? pathPart : path.posix.join("/", path.relative(DIST, dir).replace(/\\/g, "/"), pathPart);
      if (!fileResolves(candidate)) fail(relative, `link "${raw}" does not resolve to a built file (path ${candidate})`);
      checkedLinks += 1;
    }
    if (hash !== undefined && hash !== "") {
      if (!hash.startsWith("/")) fail(relative, `link "${raw}" has a fragment that is not a hash route`);
      else if (!hashRouteResolves(hash)) fail(relative, `link "${raw}" targets a route the router does not define`);
      checkedLinks += 1;
    }
  }
}

// --- Route table vs. emitted shells ------------------------------------------
const expectedShells = [
  ...SECTION_ROUTES.map((route) => route.path),
  ...toolRegistry.map((tool) => `/tools/${tool.slug}/`),
  ...gameRegistry.map((game) => `/games/${game.slug}/`),
];
let shellsChecked = 0;
for (const urlPath of expectedShells) {
  const file = path.join(DIST, urlPath.replace(/^\/+|\/+$/g, ""), "index.html");
  if (!existsSync(file)) fail("route table", `no shell emitted for ${urlPath}`);
  else shellsChecked += 1;
}

// --- Sitemap must list exactly the emitted shells plus the home page ----------
const sitemapPath = path.join(DIST, "sitemap.xml");
if (existsSync(sitemapPath)) {
  const locs = [...readFileSync(sitemapPath, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const locPaths = locs.map((url) => new URL(url).pathname);
  const homeLocs = locPaths.filter((item) => item === "/").length;
  if (homeLocs !== 1) fail("sitemap.xml", `expected exactly one home URL, found ${homeLocs}`);
  if (locPaths.length - 1 !== expectedShells.length) {
    fail("sitemap.xml", `lists ${locPaths.length - 1} shell URLs but ${expectedShells.length} were expected`);
  }
} else {
  fail("sitemap.xml", "missing");
}

console.log(`Checked ${checkedLinks} internal link target(s) in ${htmlFiles.length} built HTML file(s).`);
console.log(`Checked ${shellsChecked}/${expectedShells.length} route-table shells against the emitted output.`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n`);
  for (const problem of problems) console.log(`  ${problem}`);
  process.exit(1);
}
console.log("Every internal link, hash route and clean path resolves in the built output.");
