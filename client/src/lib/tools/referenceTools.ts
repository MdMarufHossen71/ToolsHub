/** Browser-local tools mapped from the supplied Free Tools for Web reference. */
import { ToolError, field, type ToolRunner } from "@/lib/toolOperations";

const read = (extra: Parameters<ToolRunner>[4], key: string, fallback = "") => field(extra, key, fallback).trim();
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
const escapeXml = escapeHtml;
const finite = (value: string, fallback?: number) => {
  const number = value === "" && fallback !== undefined ? fallback : Number(value);
  if (!Number.isFinite(number)) throw new ToolError("tool.error.number");
  return number;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, places = 2) => Number(value.toFixed(places));
const fmt = (value: number, currency = "USD") => `${currency} ${round(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function validWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function jsonToType(value: unknown, name: string): string {
  const identifier = name.replace(/[^a-zA-Z0-9_$]/g, "_").replace(/^[^a-zA-Z_$]/, "_");
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (!value.length) return "unknown[]";
    const types = [...new Set(value.map((item) => jsonToType(item, `${identifier}Item`)))];
    return `(${types.join(" | ")})[]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return "Record<string, unknown>";
    const members = entries.map(([key, item]) => `  ${JSON.stringify(key)}: ${jsonToType(item, `${identifier}${key}`)};`);
    return `{\n${members.join("\n")}\n}`;
  }
  return typeof value;
}

function tokenizeShell(command: string) {
  const tokens: string[] = [];
  let token = "";
  let quote = "";
  let escaped = false;
  for (const char of command.replace(/\\\r?\n/g, " ")) {
    if (escaped) { token += char; escaped = false; continue; }
    if (char === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ""; else token += char; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/\s/.test(char)) { if (token) { tokens.push(token); token = ""; } continue; }
    token += char;
  }
  if (quote || escaped) throw new ToolError("tool.error.generic");
  if (token) tokens.push(token);
  return tokens;
}

function parseCurl(input: string) {
  const tokens = tokenizeShell(input.trim().replace(/^\$\s*/, ""));
  if (tokens.shift() !== "curl") throw new ToolError("tool.error.generic");
  let url = "";
  let method = "";
  let body: string | undefined;
  const headers: Array<[string, string]> = [];
  const takesValue = new Set(["-X", "--request", "-H", "--header", "-d", "--data", "--data-raw", "--url"]);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? "";
    if (takesValue.has(token)) {
      const value = tokens[++i];
      if (value === undefined) throw new ToolError("tool.error.generic");
      if (token === "-X" || token === "--request") method = value.toUpperCase();
      else if (token === "-H" || token === "--header") {
        const split = value.indexOf(":");
        if (split < 1) throw new ToolError("tool.error.generic");
        headers.push([value.slice(0, split).trim(), value.slice(split + 1).trim()]);
      } else if (token === "--url") url = value;
      else body = value;
    } else if (token === "-s" || token === "-S" || token === "-L" || token === "--compressed" || token === "-i") {
      continue;
    } else if (token.startsWith("-")) {
      throw new ToolError("tool.error.generic");
    } else if (!url) url = token;
    else throw new ToolError("tool.error.generic");
  }
  url = validWebUrl(url);
  if (!url) throw new ToolError("tool.error.generic");
  return { url, method: method || (body === undefined ? "GET" : "POST"), body, headers };
}

function luhn(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function makeSvgArtifact(svg: string, name: string) {
  const dataUrl = `data:image/svg+xml;base64,${toBase64(svg)}`;
  return { text: "Diagram ready. Download the SVG to open it in a browser or design app.", image: dataUrl, artifacts: [{ name, mime: "image/svg+xml", dataUrl }] };
}

function erDiagram(source: string) {
  const tables = new Map<string, string[]>();
  const refs: Array<[string, string, string, string]> = [];
  const lines = source.slice(0, 12000).split(/\r?\n/);
  let active = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const table = line.match(/^(?:Table\s+)?([\w.-]+)\s*\{?\s*$/i);
    if (table && /\bTable\b/i.test(line)) { active = table[1] ?? ""; if (!tables.has(active)) tables.set(active, []); continue; }
    if (active && line === "}") { active = ""; continue; }
    const relation = line.match(/^(?:Ref:\s*)?([\w.-]+)\.([\w.-]+)\s*(?:->|>|<)\s*([\w.-]+)\.([\w.-]+)$/i);
    if (relation) { refs.push([relation[1] ?? "", relation[2] ?? "", relation[3] ?? "", relation[4] ?? ""]); continue; }
    const compact = line.match(/^([\w.-]+)\s*:\s*(.+)$/);
    if (compact) {
      const name = compact[1] ?? "";
      tables.set(name, (compact[2] ?? "").split(/[,\s]+/).filter(Boolean).slice(0, 18));
      active = "";
      continue;
    }
    if (active) tables.get(active)?.push(line.replace(/[,;]$/, "").replace(/\s+\[[^\]]+\]/g, "").slice(0, 48));
  }
  if (!tables.size || tables.size > 15) throw new ToolError("tool.error.generic");
  const entries = [...tables.entries()];
  const width = 220;
  const gapX = 70;
  const gapY = 44;
  const header = 34;
  const row = 25;
  const positions = entries.map(([name, columns], index) => ({ name, columns: columns.slice(0, 18), x: 30 + (index % 3) * (width + gapX), y: 30 + Math.floor(index / 3) * (Math.max(150, header + Math.min(columns.length, 18) * row) + gapY) }));
  const lookup = new Map(positions.map((item) => [item.name, item]));
  const maxY = Math.max(...positions.map((item) => item.y + header + Math.max(1, item.columns.length) * row)) + 35;
  const svgWidth = 3 * width + 2 * gapX + 60;
  const edgeLines = refs.map(([from, fromCol, to, toCol]) => {
    const a = lookup.get(from); const b = lookup.get(to);
    if (!a || !b) return "";
    const x1 = a.x + width; const y1 = a.y + header + 12;
    const x2 = b.x; const y2 = b.y + header + 12;
    const midX = Math.round((x1 + x2) / 2);
    return `<path d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" fill="none" stroke="#60a5fa" stroke-width="2" marker-end="url(#arrow)"/><text x="${midX}" y="${Math.min(y1, y2) - 8}" fill="#dbeafe" font-size="11" text-anchor="middle">${escapeXml(`${from}.${fromCol} → ${to}.${toCol}`)}</text>`;
  }).join("");
  const boxes = positions.map(({ name, columns, x, y }) => `<g><rect x="${x}" y="${y}" width="${width}" height="${header + Math.max(1, columns.length) * row}" rx="10" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/><path d="M ${x} ${y + header} H ${x + width}" stroke="#38bdf8"/><text x="${x + 13}" y="${y + 23}" fill="#f8fafc" font-size="15" font-weight="700">${escapeXml(name)}</text>${(columns.length ? columns : ["(no fields)"]).map((col, i) => `<text x="${x + 14}" y="${y + header + 18 + i * row}" fill="#cbd5e1" font-size="12">${escapeXml(col)}</text>`).join("")}</g>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${maxY}" viewBox="0 0 ${svgWidth} ${maxY}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#60a5fa"/></marker></defs><rect width="100%" height="100%" fill="#020617"/>${edgeLines}${boxes}</svg>`;
  return makeSvgArtifact(svg, "er-diagram.svg");
}

type MindNode = { label: string; depth: number; children: MindNode[]; x: number; y: number };
function mindMap(source: string) {
  const root: MindNode = { label: "Mind Map", depth: 0, children: [], x: 30, y: 0 };
  const stack: MindNode[] = [root];
  const sourceLines = source.split(/\r?\n/).filter((line) => line.trim()).slice(0, 80);
  for (const [index, raw] of sourceLines.entries()) {
    const leading = raw.match(/^[\t ]*/)?.[0] ?? "";
    const depth = Math.floor(leading.replace(/\t/g, "  ").length / 2) + 1;
    const label = raw.trim().replace(/^[-*+]\s*/, "").slice(0, 100);
    if (!label) continue;
    if (index === 0 && leading.length === 0 && !/^(?:[-*+])\s/.test(raw)) { root.label = label; continue; }
    while (stack.length > depth) stack.pop();
    const parent = stack[depth - 1] ?? root;
    const node: MindNode = { label, depth: parent.depth + 1, children: [], x: 0, y: 0 };
    parent.children.push(node);
    stack[depth] = node;
    stack.length = depth + 1;
  }
  let cursor = 50;
  const place = (node: MindNode) => {
    node.x = 35 + node.depth * 235;
    if (!node.children.length) { node.y = cursor; cursor += 75; return; }
    node.children.forEach(place);
    node.y = (node.children[0]?.y ?? cursor) + ((node.children[node.children.length - 1]?.y ?? cursor) - (node.children[0]?.y ?? cursor)) / 2;
  };
  place(root);
  const nodes: MindNode[] = [];
  const collect = (node: MindNode) => { nodes.push(node); node.children.forEach(collect); };
  collect(root);
  const edges = nodes.flatMap((node) => node.children.map((child) => `<path d="M ${node.x + 180} ${node.y + 22} C ${node.x + 215} ${node.y + 22}, ${child.x - 35} ${child.y + 22}, ${child.x} ${child.y + 22}" fill="none" stroke="#60a5fa" stroke-width="2"/>`)).join("");
  const shapes = nodes.map((node) => `<g><rect x="${node.x}" y="${node.y}" width="180" height="44" rx="12" fill="${node.depth ? "#0f172a" : "#134e4a"}" stroke="${node.depth ? "#38bdf8" : "#2dd4bf"}" stroke-width="2"/><text x="${node.x + 90}" y="${node.y + 27}" fill="#f8fafc" font-size="13" text-anchor="middle">${escapeXml(node.label)}</text></g>`).join("");
  const width = Math.max(420, ...nodes.map((node) => node.x + 215));
  const height = Math.max(140, cursor + 15);
  return makeSvgArtifact(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#020617"/>${edges}${shapes}</svg>`, "mind-map.svg");
}

const documentTitles: Record<string, string> = {
  "invoice-generator": "Invoice", "quote-generator": "Quote", "receipt-generator": "Receipt", "purchase-order-generator": "Purchase Order",
};

function makeBusinessDocument(slug: string, readField: (key: string, fallback?: string) => string) {
  const title = documentTitles[slug] ?? "Invoice";
  const currency = readField("currency", "USD").toUpperCase().slice(0, 3) || "USD";
  const rows = readField("items", "Design work | 2 | 150\nHosting | 1 | 20").split(/\r?\n/).filter(Boolean).slice(0, 60).map((line) => {
    const [description = "", quantityRaw = "1", priceRaw = "0"] = line.split("|");
    const quantity = finite(quantityRaw.trim(), 1);
    const price = finite(priceRaw.trim(), 0);
    if (quantity < 0 || price < 0) throw new ToolError("tool.error.number");
    return { description: description.trim(), quantity, price, total: quantity * price };
  });
  if (!rows.length) throw new ToolError("tool.error.generic");
  const subtotal = rows.reduce((sum, item) => sum + item.total, 0);
  const taxRate = clamp(finite(readField("tax", "0"), 0), 0, 100);
  const tax = subtotal * taxRate / 100;
  const total = subtotal + tax;
  const rowsHtml = rows.map((item) => `<tr><td>${escapeHtml(item.description)}</td><td>${item.quantity}</td><td>${fmt(item.price, currency)}</td><td>${fmt(item.total, currency)}</td></tr>`).join("");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)} ${escapeHtml(readField("number", "001"))}</title><style>body{font:15px Arial,sans-serif;color:#172033;margin:40px auto;max-width:820px;padding:28px}header{display:flex;justify-content:space-between;border-bottom:2px solid #0f766e;padding-bottom:18px}h1{color:#0f766e}small{color:#64748b}table{width:100%;border-collapse:collapse;margin-top:32px}th,td{text-align:left;padding:11px;border-bottom:1px solid #dbe3ea}th{background:#f1f5f9}.totals{margin:22px 0 0 auto;width:260px}.totals p{display:flex;justify-content:space-between}.grand{font-size:20px;font-weight:bold;border-top:2px solid #0f766e;padding-top:10px}.notes{margin-top:36px;white-space:pre-wrap}@media print{body{margin:0;max-width:none}}</style><body><header><div><h1>${escapeHtml(title)}</h1><strong>${escapeHtml(readField("business", "Your business"))}</strong><br><small>${escapeHtml(readField("businessContact", ""))}</small></div><div><b>#${escapeHtml(readField("number", "001"))}</b><br><small>Date: ${escapeHtml(readField("date", new Date().toISOString().slice(0, 10)))}</small><br><small>Due: ${escapeHtml(readField("due", ""))}</small></div></header><p><b>Prepared for</b><br>${escapeHtml(readField("client", "Client name"))}<br><small>${escapeHtml(readField("clientContact", ""))}</small></p><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${rowsHtml}</tbody></table><section class="totals"><p><span>Subtotal</span><span>${fmt(subtotal, currency)}</span></p><p><span>Tax (${taxRate}%)</span><span>${fmt(tax, currency)}</span></p><p class="grand"><span>Total</span><span>${fmt(total, currency)}</span></p></section>${readField("notes") ? `<div class="notes"><b>Notes</b><br>${escapeHtml(readField("notes"))}</div>` : ""}<p class="notes"><small>Generated locally. Review details before sending.</small></p></body></html>`;
  return {
    text: `${title} ${readField("number", "001")}\n${readField("business", "Your business")} → ${readField("client", "Client name")}\nSubtotal: ${fmt(subtotal, currency)}\nTax: ${fmt(tax, currency)}\nTotal: ${fmt(total, currency)}\n\nDownload the HTML file and print it or choose Save as PDF in your browser.`,
    html,
    artifacts: [{ name: `${title.toLowerCase().replace(/\s+/g, "-")}-${readField("number", "001").replace(/[^a-zA-Z0-9_-]/g, "")}.html`, mime: "text/html", dataUrl: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` }],
  };
}

export const runReferenceTools: ToolRunner = async (slug, input, _option, _t, extra) => {
  const F = (key: string, fallback = "") => read(extra, key, fallback);
  const source = field(extra, "text", input);

  if (slug === "er-diagram-maker") return erDiagram(source || "users: id (PK), name, email\nposts: id (PK), user_id (FK), title\nusers.id -> posts.user_id");
  if (slug === "mind-map-maker") return mindMap(source || "Project\n  Research\n  Design\n  Build\n    Frontend\n    Backend\n  Launch");
  if (slug === "json-to-typescript") {
    let value: unknown;
    try { value = JSON.parse(source); } catch { throw new ToolError("tool.error.generic"); }
    return { text: `export type Root = ${jsonToType(value, "Root")};` };
  }
  if (slug === "curl-to-code") {
    const request = parseCurl(source);
    const headers = Object.fromEntries(request.headers);
    const fetchOptions = { method: request.method, ...(Object.keys(headers).length ? { headers } : {}), ...(request.body !== undefined ? { body: request.body } : {}) };
    const language = F("language", "javascript");
    if (language === "python") return { text: `import requests\n\nresponse = requests.request(\n    ${JSON.stringify(request.method)},\n    ${JSON.stringify(request.url)},\n    headers=${JSON.stringify(headers)},\n    ${request.body === undefined ? "" : `data=${JSON.stringify(request.body)},\n    `}timeout=30,\n)\nprint(response.status_code)\nprint(response.text)` };
    return { text: `const response = await fetch(${JSON.stringify(request.url)}, ${JSON.stringify(fetchOptions, null, 2)});\nconst body = await response.text();\nconsole.log(response.status, body);` };
  }
  if (slug === "docker-run-to-compose") {
    const tokens = tokenizeShell(source.trim().replace(/^\$\s*/, ""));
    if (tokens.shift() !== "docker" || tokens.shift() !== "run") throw new ToolError("tool.error.generic");
    let name = "app"; let image = ""; let restart = ""; let workdir = ""; let network = "";
    const ports: string[] = []; const env: string[] = []; const volumes: string[] = []; const command: string[] = [];
    const optionMap = new Map<string, (value: string) => void>([
      ["--name", (v) => { name = v.replace(/[^a-zA-Z0-9_-]/g, "-") || "app"; }], ["--restart", (v) => { restart = v; }],
      ["-p", (v) => ports.push(v)], ["--publish", (v) => ports.push(v)], ["-e", (v) => env.push(v)], ["--env", (v) => env.push(v)],
      ["-v", (v) => volumes.push(v)], ["--volume", (v) => volumes.push(v)], ["-w", (v) => { workdir = v; }], ["--workdir", (v) => { workdir = v; }],
      ["--network", (v) => { network = v; }],
    ]);
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i] ?? "";
      const equals = token.indexOf("=");
      const key = equals > 0 ? token.slice(0, equals) : token;
      const inline = equals > 0 ? token.slice(equals + 1) : undefined;
      const setter = optionMap.get(key);
      if (setter) {
        const value = inline ?? tokens[++i];
        if (!value) throw new ToolError("tool.error.generic");
        setter(value);
      } else if (["-d", "--detach", "--rm", "-i", "-t", "-it", "-ti"].includes(token)) continue;
      else if (token.startsWith("-")) throw new ToolError("tool.error.generic");
      else if (!image) image = token;
      else command.push(token);
    }
    if (!image) throw new ToolError("tool.error.generic");
    const lines = ["services:", `  ${name}:`, `    image: ${JSON.stringify(image)}`];
    if (ports.length) lines.push("    ports:", ...ports.map((value) => `      - ${JSON.stringify(value)}`));
    if (env.length) lines.push("    environment:", ...env.map((value) => { const at = value.indexOf("="); return `      ${JSON.stringify(at < 0 ? value : value.slice(0, at))}: ${JSON.stringify(at < 0 ? "" : value.slice(at + 1))}`; }));
    if (volumes.length) lines.push("    volumes:", ...volumes.map((value) => `      - ${JSON.stringify(value)}`));
    if (restart) lines.push(`    restart: ${JSON.stringify(restart)}`);
    if (workdir) lines.push(`    working_dir: ${JSON.stringify(workdir)}`);
    if (network) lines.push(`    network_mode: ${JSON.stringify(network)}`);
    if (command.length) lines.push(`    command: ${JSON.stringify(command)}`);
    return { text: lines.join("\n") };
  }
  if (slug === "gitignore-generator") {
    const profiles: Record<string, string[]> = {
      node: ["node_modules/", "dist/", "coverage/", ".env", ".env.*", "!.env.example"],
      python: ["__pycache__/", "*.py[cod]", ".venv/", "venv/", ".pytest_cache/"],
      windows: ["Thumbs.db", "Desktop.ini", "$RECYCLE.BIN/"],
      macos: [".DS_Store", ".AppleDouble", ".LSOverride"],
      linux: ["*~", ".directory"],
      vscode: [".vscode/*", "!.vscode/extensions.json", "!.vscode/settings.json"],
      jetbrains: [".idea/", "*.iml"],
      rust: ["/target/", "Cargo.lock"], go: ["/bin/", "*.test", "vendor/"], java: ["*.class", "target/", "build/"]
    };
    const selected = F("profiles", "node,windows,macos,vscode").split(/[\s,]+/).map((x) => x.toLowerCase()).filter((x) => profiles[x]);
    return { text: [...new Set(selected.flatMap((name) => profiles[name] ?? []))].join("\n") };
  }
  if (slug === "security-txt-generator") {
    const oneLine = (value: string) => value.replace(/[\r\n\t]/g, " ").trim();
    const contact = oneLine(F("contact"));
    if (!contact || (!/^mailto:[^\s@]+@[^\s@]+$/i.test(contact) && !validWebUrl(contact))) throw new ToolError("tool.error.generic");
    const expiryInput = F("expires");
    const expiry = expiryInput || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const expiryDate = new Date(expiry);
    if (Number.isNaN(expiryDate.getTime()) || expiryDate <= new Date()) throw new ToolError("tool.error.generic");
    const encryption = oneLine(F("encryption")); const policy = oneLine(F("policy")); const languages = oneLine(F("languages", "en"));
    return { text: [`Contact: ${contact}`, `Expires: ${expiryDate.toISOString().replace(/\.\d{3}Z$/, "Z")}`, ...(encryption ? [`Encryption: ${validWebUrl(encryption) || encryption}`] : []), `Preferred-Languages: ${languages}`, ...(policy ? [`Policy: ${validWebUrl(policy) || policy}`] : [])].join("\n") };
  }
  if (slug === "schema-markup-generator") {
    const type = F("type", "Organization");
    const name = F("name", "Example");
    const url = validWebUrl(F("url", "https://example.com"));
    if (!url) throw new ToolError("tool.error.generic");
    const base: Record<string, unknown> = { "@context": "https://schema.org", "@type": type, name, url };
    if (F("description")) base.description = F("description");
    if (type === "Product") { base.offers = { "@type": "Offer", price: finite(F("price", "0")), priceCurrency: F("currency", "USD").toUpperCase() }; }
    if (type === "Article") { base.headline = name; if (F("author")) base.author = { "@type": "Person", name: F("author") }; }
    if (type === "FAQPage") {
      base.mainEntity = source.split(/\r?\n/).map((line) => line.split("|")).filter((parts) => parts.length >= 2 && parts[0]?.trim() && parts[1]?.trim()).slice(0, 30).map(([q, a]) => ({ "@type": "Question", name: q?.trim(), acceptedAnswer: { "@type": "Answer", text: a?.trim() } }));
      if (!(base.mainEntity as unknown[]).length) throw new ToolError("tool.error.generic");
    }
    return { text: `<script type="application/ld+json">\n${JSON.stringify(base, null, 2)}\n</script>` };
  }
  if (slug === "serp-preview" || slug === "open-graph-preview") {
    const title = F("title", "Example page title").slice(0, 120);
    const description = F("description", "Add a concise description of this page.").slice(0, 320);
    const url = validWebUrl(F("url", "https://example.com/page"));
    if (!url) throw new ToolError("tool.error.generic");
    const parsed = new URL(url);
    const html = `<div style="font:14px Arial,sans-serif;max-width:620px;padding:18px;background:#fff;color:#202124;border-radius:10px"><div style="font-size:13px;color:#5f6368">${escapeHtml(parsed.host)}</div><div style="font-size:20px;color:#1a0dab;margin:5px 0">${escapeHtml(title)}</div><div style="font-size:14px;color:#4d5156">${escapeHtml(description)}</div><div style="font-size:12px;color:#5f6368;margin-top:8px">${escapeHtml(url)}</div></div>`;
    return { text: `${title}\n${url}\n${description}`, html };
  }
  if (slug === "website-cost-calculator") {
    const pages = clamp(finite(F("pages", "5")), 1, 500);
    const complexity = clamp(finite(F("complexity", "1")), 1, 3);
    const rate = finite(F("hourlyRate", "35"));
    const features = finite(F("features", "12"));
    if (rate < 0 || features < 0) throw new ToolError("tool.error.number");
    const hours = 8 + pages * 4 * complexity + features;
    return { text: JSON.stringify({ estimatedHours: hours, estimatedCost: round(hours * rate), note: "Planning estimate only; scope and market rates vary." }, null, 2) };
  }
  if (slug === "ai-readiness-assessment") {
    const checks = source.split(/\r?\n/).map((line) => /^\s*(?:\[x\]|✓|yes\b)/i.test(line)).filter((_, i) => source.split(/\r?\n/)[i]?.trim());
    const total = checks.length || 8;
    const score = Math.round((checks.length ? checks.filter(Boolean).length / total : 0) * 100);
    return { text: JSON.stringify({ readinessScore: score, checked: checks.filter(Boolean).length, total, note: "A basic self-check, not an audit or a measure of model quality." }, null, 2) };
  }
  if (documentTitles[slug]) return makeBusinessDocument(slug, F);
  if (slug === "break-even-calculator") {
    const fixed = finite(F("fixedCosts", "5000")); const price = finite(F("price", "50")); const variable = finite(F("variableCost", "20"));
    if (fixed < 0 || price < 0 || variable < 0 || price <= variable) throw new ToolError("tool.error.number");
    const units = fixed / (price - variable);
    return { text: JSON.stringify({ contributionPerUnit: round(price - variable), breakEvenUnits: Math.ceil(units), breakEvenRevenue: round(Math.ceil(units) * price) }, null, 2) };
  }
  if (slug === "meeting-cost-calculator") {
    const count = clamp(finite(F("participants", "5")), 1, 10000); const minutes = finite(F("minutes", "60")); const hourly = finite(F("averageHourlyCost", "30"));
    if (minutes < 0 || hourly < 0) throw new ToolError("tool.error.number");
    return { text: JSON.stringify({ personHours: round(count * minutes / 60), estimatedCost: round(count * minutes / 60 * hourly), note: "Estimate based on the average hourly cost you entered." }, null, 2) };
  }
  if (slug === "readability-checker") {
    const words = source.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) ?? [];
    const sentences = (source.match(/[.!?]+/g) ?? []).length || (words.length ? 1 : 0);
    const syllables = words.reduce((sum, word) => sum + Math.max(1, (word.toLowerCase().match(/[aeiouy]+/g) ?? []).length - (/[e]$/i.test(word) && !/le$/i.test(word) ? 1 : 0)), 0);
    const score = words.length && sentences ? 206.835 - 1.015 * words.length / sentences - 84.6 * syllables / words.length : 0;
    return { text: JSON.stringify({ words: words.length, sentences, estimatedSyllables: syllables, fleschReadingEase: words.length ? round(score, 1) : null, note: "English formula and syllable counts are approximate; this is not validated for Bangla." }, null, 2) };
  }
  if (slug === "token-counter") {
    const pieces = source.match(/[\p{L}\p{N}_]+|[^\s]/gu) ?? [];
    const estimate = source ? Math.max(pieces.length, Math.ceil(source.length / 4)) : 0;
    return { text: JSON.stringify({ estimatedTokens: estimate, characters: source.length, words: source.trim() ? source.trim().split(/\s+/).length : 0, note: "Rough estimate only; exact counts vary by model tokenizer." }, null, 2) };
  }
  if (slug === "llm-api-cost-calculator") {
    const prompt = finite(F("promptTokens", "1000")); const completion = finite(F("completionTokens", "500"));
    const inputRate = finite(F("inputRate", "1")); const outputRate = finite(F("outputRate", "3"));
    return { text: JSON.stringify({ estimatedCost: round(prompt * inputRate / 1_000_000 + completion * outputRate / 1_000_000, 6), currency: "USD", ratesAreUserSuppliedPerMillionTokens: true }, null, 2) };
  }
  if (slug === "llm-vram-calculator") {
    const parameters = finite(F("parameters", "7")); const precision = finite(F("bytesPerParameter", "2")); const overhead = clamp(finite(F("overheadPercent", "25")), 0, 300);
    const weights = parameters * precision;
    return { text: JSON.stringify({ weightMemoryGiB: round(weights, 1), estimatedTotalGiB: round(weights * (1 + overhead / 100), 1), note: "Approximate model-weight estimate; context, batch size, architecture and runtime can require more memory." }, null, 2) };
  }
  if (slug === "pii-redactor") {
    let redacted = source.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]");
    redacted = redacted.replace(/\b(?:\d[ -]*?){13,19}\b/g, (candidate) => luhn(candidate) ? "[CARD]" : candidate);
    redacted = redacted.replace(/\b(?:\+?\d[\d ()-]{7,}\d)\b/g, (candidate) => {
      const digits = candidate.replace(/\D/g, "");
      return digits.length >= 9 && digits.length <= 15 ? "[PHONE]" : candidate;
    });
    return { text: redacted || "No text entered.\n\nThis local pattern-based scan can miss sensitive data; review the result before sharing." };
  }
  if (slug === "midjourney-prompt-generator") {
    return { text: [F("subject", "A quiet mountain lake at sunrise"), F("style", "cinematic landscape photography"), F("lighting", "soft golden-hour light"), F("details", "mist, reflections, fine detail"), F("ratio", "16:9") ? `--ar ${F("ratio", "16:9")}` : "", F("negative") ? `--no ${F("negative")}` : ""].filter(Boolean).join(", ") };
  }
  if (slug === "mcp-config-generator") {
    const name = F("name", "local-server").replace(/[^a-zA-Z0-9_-]/g, "-");
    const command = F("command", "npx");
    const args = F("args").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const config = { mcpServers: { [name]: { command, args, ...(F("envName") && F("envValue") ? { env: { [F("envName")]: F("envValue") } } : {}) } } };
    return { text: JSON.stringify(config, null, 2) };
  }
  if (slug === "llms-txt-generator") {
    const site = F("site", "Example site"); const description = F("description");
    const pages = source.split(/\r?\n/).map((url) => validWebUrl(url.trim())).filter(Boolean).slice(0, 200);
    return { text: [`# ${site}`, "", description, "", "## Pages", ...pages.map((url) => `- [${new URL(url).pathname || "/"}](${url})`)].filter((line, i) => line || i < 3).join("\n") };
  }
  if (slug === "prompt-template-builder") {
    const template = F("template", source || "Write a {{format}} about {{topic}} for {{audience}}.");
    const values: Record<string, string> = {};
    for (const line of F("variables", "topic=browser privacy\naudience=beginners\nformat=short guide").split(/\r?\n/)) {
      const at = line.indexOf("="); if (at > 0) values[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
    return { text: template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => values[key] ?? match) };
  }
  if (slug === "invisible-character-remover") {
    // Keep ZWNJ/ZWJ (U+200C/U+200D), which can carry meaning in Bangla and other scripts.
    const cleaned = source.replace(/(?:\u00AD|\u034F|\u061C|\u115F|\u1160|\u17B4|\u17B5|\u180E|\u200B|\u200E|\u200F|[\u202A-\u202E]|[\u2060-\u206F]|\uFEFF)/g, "");
    return { text: cleaned };
  }
  if (slug === "profit-margin-calculator") {
    const revenue = finite(F("revenue", "1000")); const cost = finite(F("cost", "650"));
    if (revenue <= 0 || cost < 0) throw new ToolError("tool.error.number");
    return { text: JSON.stringify({ profit: round(revenue - cost), marginPercent: round((revenue - cost) / revenue * 100), markupPercent: cost === 0 ? null : round((revenue - cost) / cost * 100) }, null, 2) };
  }
  if (slug === "sales-tax-calculator") {
    const amount = finite(F("amount", "100")); const rate = finite(F("rate", "8.25")); const tax = amount * rate / 100;
    if (amount < 0 || rate < 0 || rate > 100) throw new ToolError("tool.error.number");
    return { text: JSON.stringify({ subtotal: round(amount), tax: round(tax), total: round(amount + tax) }, null, 2) };
  }
  if (slug === "salary-to-hourly-calculator") {
    const annual = finite(F("annualSalary", "60000")); const hours = finite(F("hoursPerWeek", "40")); const weeks = finite(F("weeksPerYear", "52"));
    if (annual < 0 || hours <= 0 || weeks <= 0 || weeks > 52) throw new ToolError("tool.error.number");
    return { text: JSON.stringify({ hourly: round(annual / (hours * weeks)), weekly: round(annual / weeks), monthly: round(annual / 12), annual }, null, 2) };
  }
  if (slug === "time-card-calculator") {
    const parseTime = (value: string) => { const m = value.match(/^(\d{1,2}):(\d{2})$/); if (!m || Number(m[2]) > 59 || Number(m[1]) > 23) throw new ToolError("tool.error.generic"); return Number(m[1]) * 60 + Number(m[2]); };
    let minutes = parseTime(F("end", "17:00")) - parseTime(F("start", "09:00")); if (minutes < 0) minutes += 1440;
    minutes -= finite(F("breakMinutes", "30")); if (minutes < 0) throw new ToolError("tool.error.number");
    const hours = minutes / 60; const rate = finite(F("hourlyRate", "20"));
    if (rate < 0) throw new ToolError("tool.error.number");
    return { text: JSON.stringify({ hours: round(hours, 2), decimalHours: round(hours, 2), estimatedPay: round(hours * rate) }, null, 2) };
  }
  if (slug === "freelance-rate-calculator") {
    const income = finite(F("annualIncome", "60000")); const expenses = finite(F("monthlyExpenses", "500")); const hours = finite(F("hoursPerWeek", "30"));
    const utilization = clamp(finite(F("billablePercent", "60")), 1, 100); const weeks = finite(F("weeksPerYear", "48"));
    if (income < 0 || expenses < 0 || hours <= 0 || weeks <= 0 || weeks > 52) throw new ToolError("tool.error.number");
    const billable = hours * weeks * utilization / 100;
    return { text: JSON.stringify({ recommendedHourlyRate: round((income + expenses * 12) / billable), billableHoursPerYear: round(billable), note: "Estimate excludes taxes and benefits unless included in your inputs." }, null, 2) };
  }
  if (slug === "cpm-calculator") {
    const spend = finite(F("spend", "250")); const impressions = finite(F("impressions", "50000"));
    if (spend < 0 || impressions <= 0) throw new ToolError("tool.error.number");
    return { text: JSON.stringify({ cpm: round(spend / impressions * 1000), currency: F("currency", "USD").toUpperCase() }, null, 2) };
  }
  if (slug === "roas-calculator") {
    const revenue = finite(F("revenue", "2500")); const spend = finite(F("adSpend", "500"));
    if (revenue < 0 || spend <= 0) throw new ToolError("tool.error.number");
    return { text: JSON.stringify({ roas: round(revenue / spend, 2), percentage: round(revenue / spend * 100), revenue, adSpend: spend }, null, 2) };
  }
  if (slug === "ab-test-calculator") {
    const visitorsA = finite(F("visitorsA", "1000")); const conversionsA = finite(F("conversionsA", "100"));
    const visitorsB = finite(F("visitorsB", "1000")); const conversionsB = finite(F("conversionsB", "120"));
    if (visitorsA <= 0 || visitorsB <= 0 || conversionsA < 0 || conversionsB < 0 || conversionsA > visitorsA || conversionsB > visitorsB) throw new ToolError("tool.error.number");
    const rateA = conversionsA / visitorsA; const rateB = conversionsB / visitorsB;
    return { text: JSON.stringify({ conversionRateA: round(rateA * 100, 2), conversionRateB: round(rateB * 100, 2), absoluteLiftPercentagePoints: round((rateB - rateA) * 100, 2), relativeLiftPercent: rateA ? round((rateB - rateA) / rateA * 100, 2) : null, note: "Descriptive comparison only; no statistical significance test." }, null, 2) };
  }
  if (slug === "final-grade-calculator") {
    const current = finite(F("currentGrade", "82")); const weight = clamp(finite(F("completedWeight", "70")), 0, 100); const target = finite(F("targetGrade", "85"));
    if (current < 0 || current > 100 || target < 0 || target > 100) throw new ToolError("tool.error.number");
    const remaining = 100 - weight;
    const needed = remaining ? (target * 100 - current * weight) / remaining : null;
    return { text: JSON.stringify({ neededOnRemainingPercent: needed === null ? null : round(needed), remainingWeightPercent: remaining, achievableOnScale: needed === null ? target <= current : needed <= 100, note: "Assumes weighted scores use a 0–100 scale." }, null, 2) };
  }
  if (slug === "engagement-rate-calculator") {
    const followers = finite(F("followers", "10000")); const interactions = finite(F("interactions", "850"));
    if (followers <= 0 || interactions < 0) throw new ToolError("tool.error.number");
    return { text: JSON.stringify({ engagementRatePercent: round(interactions / followers * 100, 2), interactions, followers, note: "Enter total interactions for the same period or post set." }, null, 2) };
  }
  if (slug === "box-shadow-generator") {
    const x = finite(F("x", "0")); const y = finite(F("y", "8")); const blur = clamp(finite(F("blur", "24")), 0, 500); const spread = finite(F("spread", "0"));
    const color = /^#[0-9a-f]{3,8}$/i.test(F("color", "#00000040")) ? F("color", "#00000040") : "#00000040";
    return { text: `box-shadow: ${x}px ${y}px ${blur}px ${spread}px ${color};` };
  }
  if (slug === "social-media-image-sizes") {
    const rows: Array<[string, string]> = [["Instagram square", "1080 × 1080"], ["Instagram portrait", "1080 × 1350"], ["Instagram story / reel", "1080 × 1920"], ["YouTube thumbnail", "1280 × 720"], ["Facebook cover", "820 × 312"], ["LinkedIn post", "1200 × 627"], ["X post", "1600 × 900"]];
    const query = F("query").toLowerCase(); const filtered = rows.filter(([name]) => name.toLowerCase().includes(query));
    return { text: filtered.map((row) => row.join(": ")).join("\n"), table: { head: ["Asset", "Recommended pixels"], rows: filtered } };
  }
  if (slug === "ai-roi-calculator") {
    const hours = finite(F("hoursSaved", "20")); const rate = finite(F("hourlyRate", "30")); const cost = finite(F("monthlyCost", "100"));
    if (hours < 0 || rate < 0 || cost < 0) throw new ToolError("tool.error.number");
    const value = hours * rate - cost;
    return { text: JSON.stringify({ monthlyValueOfTimeSaved: round(hours * rate), monthlyNetBenefit: round(value), roiPercent: cost > 0 ? round(value / cost * 100) : null, note: "Uses your estimates; savings and quality should be checked in practice." }, null, 2) };
  }
  if (slug === "social-media-character-limits") {
    const values: Array<[string, number]> = [["X post", 280], ["LinkedIn post", 3000], ["LinkedIn profile headline", 220], ["YouTube video title", 100]];
    const rows = values.map(([name, limit]) => [name, String(limit), String(source.length), String(Math.max(0, limit - source.length))]);
    return { text: `${rows.map((row) => `${row[0]}: ${row[2]}/${row[1]} (${row[3]} remaining)`).join("\n")}\n\nLimits can change. X may count links specially.`, table: { head: ["Platform", "Limit", "Used", "Remaining"], rows } };
  }
  return null;
};
