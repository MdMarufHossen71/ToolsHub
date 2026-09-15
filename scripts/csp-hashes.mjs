/**
 * CSP hash drift gate.
 *
 * `client/public/404.html` is fully self-contained (one inline `<style>` block,
 * one inline `<script>` block) so it renders from any nested path and from a
 * subpath host. The strict Content-Security-Policy therefore allowlists those two
 * blocks by sha256 hash instead of `'unsafe-inline'`. Any edit to either block
 * changes its hash, so this script recomputes both and fails unless every copy of
 * the policy agrees:
 *
 *   - `vercel.json` (production hosting headers),
 *   - `server/security.ts` (self-host helmet headers).
 *
 * It also compares the full directive sets of both copies, so a directive added
 * on one host but not the other fails loudly instead of drifting silently.
 *
 * Run with:  node --experimental-strip-types scripts/csp-hashes.mjs
 * In CI:     after `corepack pnpm run build` (reads the source 404, not dist).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CSP_DIRECTIVES } from "../server/security.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

const page = readFileSync(path.join(ROOT, "client", "public", "404.html"), "utf8");
const styleBlock = page.match(/<style>([\s\S]*?)<\/style>/);
const scriptBlock = page.match(/<script>([\s\S]*?)<\/script>/);
if (!styleBlock || !scriptBlock) throw new Error("[csp] 404.html must contain exactly one inline <style> and one inline <script> block");

const digest = (text) => `sha256-${createHash("sha256").update(text, "utf8").digest("base64")}`;
const expected = { style: digest(styleBlock[1]), script: digest(scriptBlock[1]) };

const problems = [];
const vercel = readFileSync(path.join(ROOT, "vercel.json"), "utf8");
const serverSecurity = path.join(ROOT, "server", "security.ts");
let server = "";
try {
  server = readFileSync(serverSecurity, "utf8");
} catch {
  problems.push("server/security.ts is missing — expected the shared CSP constants there");
}

for (const [kind, hash] of Object.entries(expected)) {
  if (!vercel.includes(`'${hash}'`)) problems.push(`vercel.json is missing '${hash}' (${kind} block of 404.html)`);
  if (server && !server.includes(hash)) problems.push(`server/security.ts is missing ${hash} (${kind} block of 404.html)`);
}

console.log(`[csp] 404.html style ${expected.style}`);
console.log(`[csp] 404.html script ${expected.script}`);

// Full directive-set parity between the two hosts (order-insensitive).
{
  const vercelCsp = JSON.parse(vercel).headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
  const serverCsp = Object.entries(CSP_DIRECTIVES)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join(";");
  const parse = (s) =>
    new Map(
      s
        .split(";")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const [k, ...rest] = p.split(/\s+/);
          return [k, rest.sort().join(" ")];
        }),
    );
  const a = parse(vercelCsp);
  const b = parse(serverCsp);
  if (a.size !== b.size || [...a].some(([k, v]) => b.get(k) !== v)) {
    problems.push("CSP directive sets differ between vercel.json and server/security.ts");
  }
}

if (problems.length > 0) {
  console.log(`\n[csp] ${problems.length} problem(s):\n`);
  for (const problem of problems) console.log(`  ${problem}`);
  process.exit(1);
}
console.log("[csp] OK — every policy copy matches the 404 blocks");
