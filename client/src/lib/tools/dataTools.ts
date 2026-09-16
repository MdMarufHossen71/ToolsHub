/** Developer & data wave: parsers, tables and static references. */
import { ToolError, field, type ToolRunner } from "@/lib/toolOperations";

const HTTP_STATUS: Array<[string, string]> = [
  ["100", "Continue"], ["101", "Switching Protocols"], ["200", "OK"], ["201", "Created"],
  ["204", "No Content"], ["206", "Partial Content"], ["301", "Moved Permanently"], ["302", "Found"],
  ["304", "Not Modified"], ["307", "Temporary Redirect"], ["308", "Permanent Redirect"],
  ["400", "Bad Request"], ["401", "Unauthorized"], ["403", "Forbidden"], ["404", "Not Found"],
  ["405", "Method Not Allowed"], ["408", "Request Timeout"], ["409", "Conflict"],
  ["410", "Gone"], ["422", "Unprocessable Entity"], ["429", "Too Many Requests"],
  ["500", "Internal Server Error"], ["502", "Bad Gateway"], ["503", "Service Unavailable"], ["504", "Gateway Timeout"],
];

const MIME_TABLE: Array<[string, string]> = [
  ["html", "text/html"], ["css", "text/css"], ["js", "text/javascript"], ["json", "application/json"],
  ["xml", "application/xml"], ["pdf", "application/pdf"], ["zip", "application/zip"],
  ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["gif", "image/gif"],
  ["webp", "image/webp"], ["svg", "image/svg+xml"], ["ico", "image/x-icon"],
  ["mp3", "audio/mpeg"], ["mp4", "video/mp4"], ["webm", "video/webm"],
  ["txt", "text/plain"], ["csv", "text/csv"], ["md", "text/markdown"],
  ["woff", "font/woff"], ["woff2", "font/woff2"], ["ttf", "font/ttf"],
  ["wasm", "application/wasm"], ["bin", "application/octet-stream"],
];

const GIT_ROWS: Array<[string, string]> = [
  ["git status", "Working tree state"],
  ["git add -A", "Stage everything"],
  ["git commit -m \"msg\"", "Commit staged changes"],
  ["git push origin main", "Push to remote"],
  ["git pull --rebase", "Fetch + replay local commits"],
  ["git log --oneline -10", "Compact history"],
  ["git diff", "Unstaged changes"],
  ["git diff --cached", "Staged changes"],
  ["git checkout -b name", "New branch + switch"],
  ["git switch main", "Switch branch"],
  ["git stash / pop", "Shelve / restore changes"],
  ["git reset --soft HEAD~1", "Undo last commit, keep changes"],
  ["git revert <sha>", "Safe undo of a public commit"],
  ["git cherry-pick <sha>", "Copy one commit over"],
  ["git rebase -i HEAD~3", "Rewrite recent history"],
  ["git remote -v", "List remotes"],
  ["git tag v1.0", "Tag a release"],
  ["git clean -fd", "Delete untracked files (careful)"],
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out >>> 0;
}

function intToIpv4(n: number): string {
  return [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join(".");
}

function parseUA(ua: string): { browser: string; os: string; mobile: boolean; engine: string } {
  const lower = ua.toLowerCase();
  let browser = "Unknown";
  const edge = lower.match(/edg\/([\d.]+)/);
  const chrome = lower.match(/(?:chrome|crios)\/([\d.]+)/);
  const firefox = lower.match(/(?:firefox|fxios)\/([\d.]+)/);
  const safari = lower.match(/version\/([\d.]+).*safari/);
  if (edge) browser = `Edge ${edge[1]}`;
  else if (lower.includes("opera") || lower.includes("opr/")) browser = `Opera ${(lower.match(/(?:opera|opr)\/([\d.]+)/) ?? [])[1] ?? ""}`.trim();
  else if (chrome && !lower.includes("edg")) browser = `Chrome ${chrome[1]}`;
  else if (firefox) browser = `Firefox ${firefox[1]}`;
  else if (safari) browser = `Safari ${safari[1]}`;
  let os = "Unknown";
  if (lower.includes("windows nt 10")) os = "Windows 10/11";
  else if (lower.includes("windows")) os = "Windows";
  else if (lower.includes("android")) os = `Android ${(lower.match(/android ([\d.]+)/) ?? [])[1] ?? ""}`.trim();
  else if (lower.includes("iphone") || lower.includes("ipad")) os = "iOS";
  else if (lower.includes("mac os x")) os = "macOS";
  else if (lower.includes("linux")) os = "Linux";
  const engine = lower.includes("applewebkit") ? "WebKit/Blink" : lower.includes("gecko") ? "Gecko" : lower.includes("trident") ? "Trident" : "Unknown";
  return { browser, os, mobile: /mobile|android|iphone|ipad/i.test(ua), engine };
}

export const runDataTools: ToolRunner = async (slug, input, _option, _t, extra) => {
  const F = (key: string, fallback = "") => field(extra, key, fallback);

  if (slug === "json-to-csv-tsv") {
    const { default: Papa } = await import("papaparse");
    let data: unknown;
    try {
      data = JSON.parse(F("text", input));
    } catch {
      throw new ToolError("tool.error.generic");
    }
    if (!Array.isArray(data)) throw new ToolError("tool.error.generic");
    const delimiter = F("mode", "csv") === "tsv" ? "\t" : ",";
    const rows = data as Record<string, unknown>[];
    const head = Array.from(new Set(rows.flatMap((row) => (row && typeof row === "object" ? Object.keys(row) : [])))).slice(0, 12);
    return {
      text: Papa.unparse(rows, { delimiter }),
      table:
        head.length > 0
          ? { head, rows: rows.slice(0, 50).map((row) => head.map((key) => String(row[key] ?? ""))) }
          : undefined,
    };
  }
  if (slug === "csv-converter") {
    const { default: Papa } = await import("papaparse");
    const parsed = Papa.parse<Record<string, string>>(F("text", input), { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0 && parsed.data.length === 0) throw new ToolError("tool.error.generic");
    const mode = F("mode", "json");
    if (mode === "tsv") return { text: Papa.unparse(parsed.data, { delimiter: "\t" }) };
    if (mode === "md") {
      const fields = parsed.meta.fields ?? [];
      const rows = parsed.data.map((row) => `| ${fields.map((f) => row[f] ?? "").join(" | ")} |`);
      return { text: [`| ${fields.join(" | ")} |`, `| ${fields.map(() => "---").join(" | ")} |`, ...rows].join("\n") };
    }
    const fields = parsed.meta.fields ?? [];
    return {
      text: JSON.stringify(parsed.data, null, 2),
      table:
        fields.length > 0
          ? { head: fields, rows: parsed.data.slice(0, 50).map((row) => fields.map((f) => row[f] ?? "")) }
          : undefined,
    };
  }
  if (slug === "csv-sorter") {
    const { default: Papa } = await import("papaparse");
    const parsed = Papa.parse<Record<string, string>>(F("text", input), { header: true, skipEmptyLines: true });
    const column = F("column").trim();
    if (!column || parsed.errors.length > 0) throw new ToolError("tool.error.generic");
    const desc = F("mode", "desc") === "desc";
    const rows = [...parsed.data].sort((a, b) => {
      const x = a[column] ?? "";
      const y = b[column] ?? "";
      const nx = Number(x);
      const ny = Number(y);
      const cmp = Number.isFinite(nx) && Number.isFinite(ny) && x !== "" && y !== "" ? nx - ny : x.localeCompare(y, undefined, { numeric: true });
      return desc ? -cmp : cmp;
    });
    return { text: Papa.unparse(rows), table: { head: parsed.meta.fields ?? [], rows: rows.map((r) => (parsed.meta.fields ?? []).map((f) => r[f] ?? "")) } };
  }
  if (slug === "json-diff") {
    const { diffJson } = await import("diff");
    let a: unknown;
    let b: unknown;
    try {
      a = JSON.parse(F("text", input));
      b = JSON.parse(F("text2"));
    } catch {
      throw new ToolError("tool.error.generic");
    }
    const parts = diffJson(a as object, b as object);
    return {
      text: parts.map((part: { value: string }) => part.value).join(""),
      table: {
        head: ["Change", "Lines"],
        rows: parts.filter((part: { added?: boolean; removed?: boolean }) => part.added || part.removed).map((part: { added?: boolean; value: string }) => [part.added ? "+" : "-", part.value.trim().slice(0, 300)]),
      },
    };
  }
  if (slug === "compare-files") {
    const { diffLines } = await import("diff");
    const parts = diffLines(F("text", input), F("text2"));
    const added = parts.filter((p: { added?: boolean }) => p.added).reduce((n: number, p: { count?: number }) => n + (p.count ?? 0), 0);
    const removed = parts.filter((p: { removed?: boolean }) => p.removed).reduce((n: number, p: { count?: number }) => n + (p.count ?? 0), 0);
    return {
      text: parts.map((part: { added?: boolean; removed?: boolean; value: string }) => (part.added ? "+ " : part.removed ? "- " : "  ") + part.value).join(""),
      table: { head: ["Metric", "Lines"], rows: [["Added", String(added)], ["Removed", String(removed)]] },
    };
  }
  if (slug === "regex-tester") {
    const pattern = F("pattern");
    if (!pattern) throw new ToolError("tool.error.generic");
    const flags = F("flags", "gi").replace(/[^dgimsuy]/g, "");
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`);
    } catch {
      throw new ToolError("tool.error.generic");
    }
    const text = F("text", input);
    const matches: string[][] = [];
    const global = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
    let hit: RegExpExecArray | null;
    while ((hit = global.exec(text)) !== null && matches.length < 200) {
      matches.push([hit[0], String(hit.index), hit.slice(1).join(", ")]);
      if (hit[0] === "") global.lastIndex += 1;
    }
    return {
      text: matches.length === 0 ? "No matches." : matches.map(([match, index]) => `${match} @${index}`).join("\n"),
      table: { head: ["Match", "Index", "Groups"], rows: matches },
    };
  }
  if (slug === "url-builder") {
    let url: URL;
    try {
      url = new URL(F("base").trim());
    } catch {
      throw new ToolError("tool.error.generic");
    }
    for (const line of F("params").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes("=")) continue;
      const separator = trimmed.indexOf("=");
      url.searchParams.set(trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim());
    }
    return { text: url.toString() };
  }
  if (slug === "open-graph-generator") {
    const title = F("title");
    const desc = F("desc");
    const url = F("url");
    const image = F("image");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return {
      text: [
        `<meta property="og:title" content="${esc(title)}">`,
        `<meta property="og:description" content="${esc(desc)}">`,
        `<meta property="og:url" content="${esc(url)}">`,
        `<meta property="og:image" content="${esc(image)}">`,
        `<meta property="og:type" content="website">`,
        `<meta name="twitter:card" content="summary_large_image">`,
      ].join("\n"),
    };
  }
  if (slug === "twitter-card-generator") {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return {
      text: [
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${esc(F("title"))}">`,
        `<meta name="twitter:description" content="${esc(F("desc"))}">`,
        `<meta name="twitter:image" content="${esc(F("image"))}">`,
      ].join("\n"),
    };
  }
  if (slug === "meta-tags-generator") {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return {
      text: [
        `<title>${esc(F("title"))}</title>`,
        `<meta name="description" content="${esc(F("desc"))}">`,
        `<meta name="keywords" content="${esc(F("keywords"))}">`,
        `<meta name="viewport" content="width=device-width, initial-scale=1">`,
        `<meta charset="utf-8">`,
      ].join("\n"),
    };
  }
  if (slug === "robots-txt-generator") {
    const rules = F("disallow").split(",").map((s) => s.trim()).filter(Boolean).map((path) => `Disallow: ${path.startsWith("/") ? path : `/${path}`}`);
    return { text: ["User-agent: *", ...rules, "", `Sitemap: ${F("sitemap").trim()}`].join("\n") };
  }
  if (slug === "xml-sitemap-generator") {
    const urls = F("text", input).split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 1000);
    for (const item of urls) {
      try {
        new URL(item);
      } catch {
        throw new ToolError("tool.error.generic");
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    return {
      text: ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls.map((item) => `  <url><loc>${item}</loc><lastmod>${today}</lastmod></url>`), "</urlset>"].join("\n"),
    };
  }
  if (slug === "device-information") {
    if (typeof window === "undefined" || !window.navigator) throw new ToolError("tool.error.generic");
    const nav = window.navigator;
    return {
      text: JSON.stringify(
        {
          userAgent: nav.userAgent,
          language: nav.language,
          languages: nav.languages,
          hardwareConcurrency: nav.hardwareConcurrency,
          deviceMemoryGb: (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? "unknown",
          maxTouchPoints: nav.maxTouchPoints,
          online: nav.onLine,
          screen: `${window.screen.width}×${window.screen.height}`,
          viewport: `${window.innerWidth}×${window.innerHeight}`,
        },
        null,
        2,
      ),
    };
  }
  if (slug === "user-agent-parser") {
    const parsed = parseUA(F("text", input));
    return { text: JSON.stringify(parsed, null, 2) };
  }
  if (slug === "http-status-codes") {
    const query = F("query").toLowerCase();
    const rows = HTTP_STATUS.filter(([code, name]) => query === "" || code.includes(query) || name.toLowerCase().includes(query));
    return { text: rows.map(([code, name]) => `${code} ${name}`).join("\n"), table: { head: ["Code", "Meaning"], rows } };
  }
  if (slug === "mime-types-lookup") {
    const query = F("query").toLowerCase().replace(/^\./, "");
    const rows = MIME_TABLE.filter(([ext, mime]) => query === "" || ext.includes(query) || mime.includes(query));
    return { text: rows.map(([ext, mime]) => `.${ext} → ${mime}`).join("\n"), table: { head: ["Extension", "MIME"], rows } };
  }
  if (slug === "git-cheatsheet") {
    const query = F("query").toLowerCase();
    const rows = GIT_ROWS.filter(([cmd, desc]) => query === "" || cmd.includes(query) || desc.toLowerCase().includes(query));
    return { text: rows.map(([cmd, desc]) => `${cmd} — ${desc}`).join("\n"), table: { head: ["Command", "Does"], rows } };
  }
  if (slug === "random-port-generator") {
    const count = Math.min(Math.max(parseInt(F("count", "5"), 10) || 5, 1), 50);
    const low = F("registered") === "on" ? 1024 : 1;
    const bytes = crypto.getRandomValues(new Uint16Array(count));
    const ports = Array.from(bytes, (b) => String(low + (b % (65535 - low))));
    return { text: ports.join("\n") };
  }
  if (slug === "mac-address-generator") {
    const count = Math.min(Math.max(parseInt(F("count", "3"), 10) || 3, 1), 50);
    const separator = F("sep", ":").slice(0, 1) || ":";
    const bytes = crypto.getRandomValues(new Uint8Array(count * 6));
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const parts: string[] = [];
      // Six bytes per address by loop construction; `?? 0` is type-level only.
      for (let j = 0; j < 6; j += 1) parts.push((bytes[i * 6 + j] ?? 0).toString(16).padStart(2, "0").toUpperCase());
      parts[0] = (parseInt(parts[0] ?? "", 16) & 0xfe).toString(16).padStart(2, "0").toUpperCase();
      out.push(parts.join(separator));
    }
    return { text: out.join("\n") };
  }
  if (slug === "ipv4-subnet-calculator") {
    const match = F("cidr").trim().match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
    if (!match) throw new ToolError("tool.error.generic");
    // Both groups always participate on a match; `?? ""` keeps the throw path below.
    const base = ipv4ToInt(match[1] ?? "");
    const prefix = Number(match[2] ?? "");
    if (base === null || prefix > 32) throw new ToolError("tool.error.generic");
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = (base & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const hosts = prefix >= 31 ? (prefix === 31 ? 2 : 1) : Math.pow(2, 32 - prefix) - 2;
    return {
      text: JSON.stringify(
        { network: intToIpv4(network), broadcast: intToIpv4(broadcast), mask: intToIpv4(mask), firstHost: prefix >= 31 ? intToIpv4(network) : intToIpv4(network + 1), lastHost: prefix >= 31 ? intToIpv4(broadcast) : intToIpv4(broadcast - 1), usableHosts: hosts },
        null,
        2,
      ),
    };
  }
  if (slug === "ipv4-address-converter") {
    const value = F("value").trim();
    if (value.includes(".")) {
      const n = ipv4ToInt(value);
      if (n === null) throw new ToolError("tool.error.generic");
      return { text: JSON.stringify({ integer: n, hex: `0x${n.toString(16).toUpperCase().padStart(8, "0")}` }, null, 2) };
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 4294967295) throw new ToolError("tool.error.generic");
    return { text: JSON.stringify({ ipv4: intToIpv4(n) }, null, 2) };
  }
  if (slug === "ipv4-range-expander") {
    const match = F("cidr").trim().match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
    if (!match) throw new ToolError("tool.error.generic");
    // Both groups always participate on a match; `?? ""` keeps the throw path below.
    const base = ipv4ToInt(match[1] ?? "");
    const prefix = Number(match[2] ?? "");
    if (base === null || prefix < 24 || prefix > 32) throw new ToolError("tool.error.generic");
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    const network = (base & mask) >>> 0;
    const total = Math.pow(2, 32 - prefix);
    if (total > 512) throw new ToolError("tool.error.generic");
    const out: string[] = [];
    for (let i = 0; i < total; i += 1) out.push(intToIpv4(network + i));
    return { text: out.join("\n") };
  }
  if (slug === "ipv6-ula-generator") {
    // ULA needs 40 random bits — crypto randomness, no library required.
    const count = Math.min(Math.max(parseInt(F("count", "3"), 10) || 3, 1), 20);
    const bytes = crypto.getRandomValues(new Uint8Array(count * 5));
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const slice = bytes.slice(i * 5, i * 5 + 5);
      const hex = Array.from(slice, (b) => b.toString(16).padStart(2, "0")).join("");
      out.push(`fd${hex.slice(0, 2)}:${hex.slice(2, 6)}:${hex.slice(6)}::/48`);
    }
    return { text: out.join("\n") };
  }
  if (slug === "eta-calculator") {
    const done = Number(F("done", "40"));
    const total = Number(F("total", "100"));
    const elapsed = Number(F("elapsed", "20"));
    if (![done, total, elapsed].every(Number.isFinite) || total <= 0 || done < 0 || elapsed < 0) throw new ToolError("tool.error.number");
    if (done <= 0) throw new ToolError("tool.error.number");
    const rate = done / elapsed;
    const remaining = Math.max(0, (total - done) / rate);
    return { text: JSON.stringify({ percent: Number(((done / total) * 100).toFixed(1)), perMinute: Number(rate.toFixed(2)), minutesLeft: Number(remaining.toFixed(1)) }, null, 2) };
  }
  if (slug === "svg-placeholder-generator") {
    const w = Math.min(Math.max(parseInt(F("w", "600"), 10) || 600, 1), 4000);
    const h = Math.min(Math.max(parseInt(F("h", "400"), 10) || 400, 1), 4000);
    const label = F("label", `${w}×${h}`);
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${F("bg", "#e5e7eb")}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(Math.min(w, h) / 10)}" fill="${F("fg", "#374151")}">${esc(label)}</text></svg>`;
    return {
      text: svg,
      html: svg,
      artifacts: [{ name: `placeholder-${w}x${h}.svg`, mime: "image/svg+xml", dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }],
    };
  }
  if (slug === "docker-run-converter") {
    const text = F("text", input).trim();
    if (!text.startsWith("docker run")) throw new ToolError("tool.error.generic");
    const tokens = text.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    const service: Record<string, unknown> = { image: "", ports: [], volumes: [], environment: {}, command: "" };
    let i = 2;
    for (; i < tokens.length; i += 1) {
      const token = tokens[i];
      // Loop-bounded; the guard is type-level only.
      if (token === undefined) continue;
      if (token === "-d" || token === "--detach" || token === "--rm" || token === "-it" || token === "-t") continue;
      else if ((token === "--name" || token === "-p" || token === "-v" || token === "-e" || token === "--net" || token === "--network") && i + 1 < tokens.length) {
        const value = (tokens[++i] ?? "").replace(/^["']|["']$/g, "");
        if (token === "--name") service.container_name = value;
        else if (token === "-p") (service.ports as string[]).push(value.includes(":") ? `"${value}"` : `"${value}:${value}"`);
        else if (token === "-v") (service.volumes as string[]).push(value);
        else if (token === "-e") {
          const separator = value.indexOf("=");
          (service.environment as Record<string, string>)[value.slice(0, separator)] = value.slice(separator + 1);
        } else {
          const nets = ((service.networks as string[] | undefined) ?? []) as string[];
          nets.push(value);
          service.networks = nets;
        }
      } else if (token.startsWith("--") && token.includes("=")) {
        const [key, ...rest] = token.slice(2).split("=");
        // `split` always yields at least one element; type-level only.
        if (key === undefined) continue;
        (service[key.replace(/-/g, "_")] as unknown) = rest.join("=");
      } else if (!token.startsWith("-")) {
        service.image = token;
        const rest = tokens.slice(i + 1).join(" ");
        if (rest) service.command = rest;
        break;
      }
    }
    if (!service.image) throw new ToolError("tool.error.generic");
    const name = (service.container_name as string) || "app";
    delete service.container_name;
    const lines = ["services:", `  ${name}:`, `    image: ${service.image}`];
    if ((service.ports as string[]).length > 0) lines.push("    ports:", ...(service.ports as string[]).map((p) => `      - ${p}`));
    if ((service.volumes as string[]).length > 0) lines.push("    volumes:", ...(service.volumes as string[]).map((p) => `      - ${p}`));
    if (Object.keys(service.environment as object).length > 0) {
      lines.push("    environment:");
      for (const [k, v] of Object.entries(service.environment as Record<string, string>)) lines.push(`      ${k}: "${v}"`);
    }
    if (service.command) lines.push(`    command: ${service.command}`);
    return { text: lines.join("\n") };
  }
  if (slug === "crontab-generator") {    const validateModule = await import("cron-validate");
    const nested = (validateModule.default as unknown as { default?: unknown }).default;
    const validate = (typeof nested === "function" ? nested : validateModule.default) as unknown as (expr: string) => { isValid: () => boolean };
    const { default: cronstrue } = await import("cronstrue");
    const parts = [F("minute", "*"), F("hour", "*"), F("dom", "*"), F("month", "*"), F("dow", "*")];
    const schedule = parts.join(" ");
    const checked = validate(schedule);
    if (!checked.isValid()) throw new ToolError("tool.error.generic");
    return { text: `${schedule} ${F("cmd")}\n# ${cronstrue.toString(schedule)}` };
  }
  if (slug === "html-beautifier" || slug === "css-beautifier-minifier" || slug === "javascript-beautifier-minifier") {
    const { js_beautify, css_beautify, html_beautify } = await import("js-beautify");
    const text = F("text", input);
    if (!text.trim()) throw new ToolError("tool.error.generic");
    if (slug === "html-beautifier") return { text: html_beautify(text, { indent_size: 2, wrap_line_length: 100 }) };
    if (F("mode", "beautify") === "minify") {
      if (slug === "css-beautifier-minifier") {
        const cssoModule = await import("csso");
        const csso = ((cssoModule as { default?: unknown }).default ?? cssoModule) as { minify: (source: string) => { css: string } };
        return { text: csso.minify(text).css };
      }
      const { minify } = await import("terser");
      try {
        const result = await minify(text);
        if (!result.code) throw new Error();
        return { text: result.code };
      } catch {
        throw new ToolError("tool.error.generic");
      }
    }
    if (slug === "css-beautifier-minifier") return { text: css_beautify(text) };
    return { text: js_beautify(text, { indent_size: 2 }) };
  }
  if (slug === "code-syntax-highlighter") {
    if (typeof document === "undefined") {
      const hljs = (await import("highlight.js/lib/core")).default;
      const { default: javascript } = await import("highlight.js/lib/languages/javascript");
      hljs.registerLanguage("javascript", javascript);
      const highlighted = hljs.highlight(F("text", input).slice(0, 50000), { language: "javascript" }).value;
      return { text: highlighted.replace(/<[^>]+>/g, ""), html: `<pre class="hljs">${highlighted}</pre>` };
    }
    const hljs = (await import("highlight.js/lib/core")).default;
    // Static loader map so Vite splits one chunk per language. A variable
    // `import(path)` would be left for the browser to resolve — and fail.
    const loaders: Record<string, () => Promise<{ default: unknown }>> = {
      javascript: () => import("highlight.js/lib/languages/javascript"),
      typescript: () => import("highlight.js/lib/languages/typescript"),
      xml: () => import("highlight.js/lib/languages/xml"),
      css: () => import("highlight.js/lib/languages/css"),
      json: () => import("highlight.js/lib/languages/json"),
      bash: () => import("highlight.js/lib/languages/bash"),
      yaml: () => import("highlight.js/lib/languages/yaml"),
      sql: () => import("highlight.js/lib/languages/sql"),
      markdown: () => import("highlight.js/lib/languages/markdown"),
      python: () => import("highlight.js/lib/languages/python"),
    };
    for (const [name, load] of Object.entries(loaders)) {
      hljs.registerLanguage(name, (await load()).default as Parameters<typeof hljs.registerLanguage>[1]);
    }
    const lang = F("lang", "javascript");
    const code = F("text", input).slice(0, 50000);
    let highlighted: string;
    try {
      highlighted = hljs.highlight(code, { language: hljs.getLanguage(lang) ? lang : "plaintext" }).value;
    } catch {
      highlighted = hljs.highlightAuto(code).value;
    }
    return { text: highlighted.replace(/<[^>]+>/g, ""), html: `<pre class="hljs">${highlighted}</pre>` };
  }
  if (slug === "json-schema-validator") {
    const { default: Ajv } = await import("ajv");
    let data: unknown;
    let schema: unknown;
    try {
      data = JSON.parse(F("text", input));
      schema = JSON.parse(F("schema"));
    } catch {
      throw new ToolError("tool.error.generic");
    }
    if (typeof schema !== "object" || schema === null) throw new ToolError("tool.error.generic");
    try {
      const validate = new Ajv({ allErrors: true, strict: false }).compile(schema as object);
      const valid = validate(data);
      return {
        text: JSON.stringify({ valid, errors: validate.errors ?? [] }, null, 2),
        table: { head: ["Path", "Message"], rows: (validate.errors ?? []).map((e) => [e.instancePath || "/", e.message ?? ""]) },
      };
    } catch {
      throw new ToolError("tool.error.generic");
    }
  }
  if (slug === "html-minifier") {
    const { minify } = await import("html-minifier-terser");
    try {
      const out = await minify(F("text", input), { collapseWhitespace: true, removeComments: true, removeRedundantAttributes: true, minifyCSS: true, minifyJS: true });
      return { text: out };
    } catch {
      throw new ToolError("tool.error.generic");
    }
  }
  if (slug === "css-minifier") {
    const cssoModule = await import("csso");
    // CJS/ESM interop differs between Vite and node: take whichever shape.
    const csso = ((cssoModule as { default?: unknown }).default ?? cssoModule) as { minify: (source: string) => { css: string } };
    try {
      return { text: csso.minify(F("text", input)).css };
    } catch {
      throw new ToolError("tool.error.generic");
    }
  }
  if (slug === "js-minifier") {
    const { minify } = await import("terser");
    try {
      const result = await minify(F("text", input));
      if (!result.code) throw new Error();
      return { text: result.code };
    } catch {
      throw new ToolError("tool.error.generic");
    }
  }
  if (slug === "xlsx-json-converter") {
    const file = extra?.files?.[0];
    if (!file) throw new ToolError("tool.error.generic");
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) throw new ToolError("tool.error.generic");
    if (F("mode", "to-json") === "to-csv") {
      return { text: XLSX.utils.sheet_to_csv(sheet) };
    }
    return { text: JSON.stringify(XLSX.utils.sheet_to_json(sheet), null, 2) };
  }
  if (slug === "query-string-parser") {
    const raw = F("text", input).trim();
    if (!raw) throw new ToolError("tool.error.generic");
    let source = raw.startsWith("?") ? raw.slice(1) : raw;
    if (raw.includes("://")) {
      try {
        source = new URL(raw).search.slice(1);
      } catch {
        throw new ToolError("tool.error.generic");
      }
    }
    let parsed: Record<string, string>;
    try {
      parsed = Object.fromEntries(new URLSearchParams(source));
    } catch {
      throw new ToolError("tool.error.generic");
    }
    return { text: JSON.stringify(parsed, null, 2) };
  }
  if (slug === "json-escape") {
    return { text: JSON.stringify(F("text", input)) };
  }
  return null;
};
