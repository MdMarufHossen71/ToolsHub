/**
 * Dependency vulnerability gate.
 *
 * Runs `pnpm audit` and fails on high/critical findings, except for entries in
 * EXCEPTIONS below. Each exception names the package and the honest reason it
 * is accepted — the point is that ignoring a vulnerability is a visible,
 * reviewable decision, not silence.
 *
 * Run with:  pnpm run audit:security   (also runs in CI, see .github/workflows/ci.yml)
 */
import { execFileSync } from "node:child_process";

const EXCEPTIONS = [
  {
    package: "xlsx",
    reason:
      "No upstream patch exists (patched: <0.0.0). Accepted because the parser " +
      "runs browser-local on files the visitor picks on their own device — " +
      "nothing reaches a server. Re-evaluate if upstream ships a fix.",
  },
];

// Fixed command string (no interpolation), so `shell: true` is safe here. The
// shell is needed because on Windows `pnpm`/`corepack` resolve as shell shims,
// which `execFileSync` cannot spawn directly (ENOENT).
function runAudit() {
  try {
    return execFileSync("pnpm audit --audit-level=high --json", { encoding: "utf8", shell: true });
  } catch (error) {
    // `pnpm audit` exits non-zero when findings exist; the JSON is still on stdout.
    const stdout = error.stdout?.toString() ?? "";
    if (stdout.trim().startsWith("{")) return stdout;
    throw error;
  }
}

const data = JSON.parse(runAudit());
const advisories = Object.values(data.advisories ?? {});
const bySeverity = { critical: 0, high: 0 };
const blocking = new Map();

for (const item of advisories) {
  const severity = item.severity;
  if (severity !== "critical" && severity !== "high") continue;
  bySeverity[severity] += 1;
  const name = item.module_name;
  if (EXCEPTIONS.some((entry) => entry.package === name)) continue;
  if (!blocking.has(name)) blocking.set(name, []);
  blocking.get(name).push(`${item.title} (patched: ${item.patched_versions})`);
}

console.log(`[security-audit] high/critical findings: ${bySeverity.high} high, ${bySeverity.critical} critical`);
for (const entry of EXCEPTIONS) {
  console.log(`[security-audit] exception: ${entry.package} — ${entry.reason}`);
}

if (blocking.size > 0) {
  for (const [name, issues] of blocking) {
    console.log(`[security-audit] BLOCKING ${name}`);
    for (const issue of issues) console.log(`  - ${issue}`);
  }
  process.exit(1);
}
console.log("[security-audit] OK");
