/** Random & generator wave: CSPRNG draws, installed validators, DOM renderers. */
import { ToolError, field, type ToolRunner } from "@/lib/toolOperations";

function randomInt(bound: number): number {
  if (bound <= 0) return 0;
  const limit = Math.floor(2 ** 32 / bound) * bound;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    // Fresh single-element buffer: always defined, the fallback is type-level only.
    const value = buffer[0] ?? 0;
    if (value < limit) return value % bound;
  }
}

function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const a = out[i];
    const b = out[j];
    // Loop-bounded on both sides; the guard is type-level only.
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

const BN_FIRST = ["আরিফ", "সুমি", "রাকিব", "নুসরাত", "তানভীর", "মিম", "সাকিব", "প্রিয়া", "হাসান", "রুমা", "ফারহান", "তিশা", "ইমরান", "শারমিন", "নাঈম", "পূজা"];
const BN_LAST = ["আহমেদ", "রহমান", "খান", "চৌধুরী", "ইসলাম", "বেগম", "হোসেন", "সরকার", "মিয়া", "তালুকদার"];
const EN_FIRST = ["Amina", "Rahim", "Sadia", "Karim", "Nusrat", "Tanvir", "Mim", "Sakib", "Priya", "Hasan", "Ruma", "Farhan", "Tisha", "Imran", "Sharmeen", "Nayeem"];
const EN_LAST = ["Ahmed", "Rahman", "Khan", "Chowdhury", "Islam", "Begum", "Hossain", "Sarker", "Miah", "Talukder"];
const MOCK_STREETS = ["Road 7, Dhanmondi", "Gulshan Avenue", "Station Road, CTG", "College Road, Sylhet", "Lake View, Banani"];
const MOCK_JOBS = ["teacher", "driver", "nurse", "shopkeeper", "developer", "student", "farmer", "tailor"];

export const runRandomTools: ToolRunner = async (slug, input, _option, _t, extra) => {
  const F = (key: string, fallback = "") => field(extra, key, fallback);

  if (slug === "gaussian-generator") {
    const mean = Number(F("mean", "0"));
    const dev = Number(F("dev", "1"));
    const count = Math.min(Math.max(parseInt(F("count", "5"), 10) || 5, 1), 100);
    if (![mean, dev].every(Number.isFinite) || dev < 0) throw new ToolError("tool.error.number");
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) {
      // Box–Muller from crypto bytes (fresh two-element buffer: always defined).
      const bytes = crypto.getRandomValues(new Uint32Array(2));
      const u1 = ((bytes[0] ?? 0) + 0.5) / 4294967296;
      const u2 = ((bytes[1] ?? 0) + 0.5) / 4294967296;
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      out.push((mean + z * dev).toFixed(4));
    }
    return { text: out.join("\n") };
  }
  if (slug === "coin-flipper") {
    const count = Math.min(Math.max(parseInt(F("count", "5"), 10) || 5, 1), 100);
    const bytes = crypto.getRandomValues(new Uint8Array(count));
    const flips = Array.from(bytes, (b) => (b % 2 === 0 ? "Heads" : "Tails"));
    const heads = flips.filter((f) => f === "Heads").length;
    return { text: JSON.stringify({ flips, heads, tails: count - heads }, null, 2) };
  }
  if (slug === "dice-roller") {
    const dice = Math.min(Math.max(parseInt(F("dice", "2"), 10) || 2, 1), 20);
    const sides = Math.min(Math.max(parseInt(F("sides", "6"), 10) || 6, 2), 100);
    const rolls = Array.from({ length: dice }, () => randomInt(sides) + 1);
    return { text: JSON.stringify({ rolls, total: rolls.reduce((a, b) => a + b, 0) }, null, 2) };
  }
  if (slug === "random-team-generator") {
    const names = F("text", input).split("\n").map((s) => s.trim()).filter(Boolean);
    const teams = Math.min(Math.max(parseInt(F("teams", "2"), 10) || 2, 2), 20);
    if (names.length < teams) throw new ToolError("tool.error.generic");
    const order = shuffle(names);
    const groups: string[][] = Array.from({ length: teams }, () => []);
    order.forEach((name, i) => {
      const group = groups[i % teams];
      // `i % teams` always lands inside; the guard is type-level only.
      if (group) group.push(name);
    });
    return { text: groups.map((group, i) => `Team ${i + 1}: ${group.join(", ")}`).join("\n") };
  }
  if (slug === "random-name-generator") {
    const count = Math.min(Math.max(parseInt(F("count", "5"), 10) || 5, 1), 50);
    const bn = F("mode", "bn") === "bn";
    const first = bn ? BN_FIRST : EN_FIRST;
    const last = bn ? BN_LAST : EN_LAST;
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) out.push(`${first[randomInt(first.length)]} ${last[randomInt(last.length)]}`);
    return { text: out.join("\n") };
  }
  if (slug === "mock-data-generator") {
    const count = Math.min(Math.max(parseInt(F("count", "5"), 10) || 5, 1), 100);
    const address = F("mode", "person") === "address";
    const rows: string[][] = [];
    for (let i = 0; i < count; i += 1) {
      const name = `${EN_FIRST[randomInt(EN_FIRST.length)] ?? "?"} ${EN_LAST[randomInt(EN_LAST.length)] ?? "?"}`;
      if (address) rows.push([name, MOCK_STREETS[randomInt(MOCK_STREETS.length)] ?? "?", `Dhaka ${1000 + randomInt(2000)}`]);
      else rows.push([name, `user${1000 + randomInt(9000)}@example.com`, MOCK_JOBS[randomInt(MOCK_JOBS.length)] ?? "?"]);
    }
    const head = address ? ["Name", "Street", "Postal"] : ["Name", "Email", "Job"];
    return { text: [head.join(","), ...rows.map((r) => r.join(","))].join("\n"), table: { head, rows } };
  }
  if (slug === "random-file-generator") {
    const sizeKb = Math.min(Math.max(parseInt(F("size", "100"), 10) || 100, 1), 5120);
    const name = (F("name", "random.bin").trim() || "random.bin").replace(/[^\w.-]+/g, "_");
    const bytes = crypto.getRandomValues(new Uint8Array(sizeKb * 1024));
    // Data URLs cap around here in some browsers; the cap above keeps it safe.
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      for (let j = i; j < Math.min(i + CHUNK, bytes.length); j += 1) binary += String.fromCharCode(bytes[j] ?? 0);
    }
    return {
      text: JSON.stringify({ file: name, bytes: bytes.length }, null, 2),
      artifacts: [{ name, mime: "application/octet-stream", dataUrl: `data:application/octet-stream;base64,${btoa(binary)}` }],
    };
  }
  if (slug === "qr-code-generator") {
    if (typeof document === "undefined") throw new ToolError("tool.error.generic");
    const { default: QRCodeStyling } = await import("qr-code-styling");
    const text = F("text", input);
    if (!text) throw new ToolError("tool.error.generic");
    const size = Math.min(Math.max(parseInt(F("size", "256"), 10) || 256, 128), 1024);
    const qr = new QRCodeStyling({ width: size, height: size, data: text, margin: 2 });
    const blob = (await qr.getRawData("png")) as Blob | null;
    if (!blob) throw new ToolError("tool.error.generic");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(blob);
    });
    return { text: JSON.stringify({ content: text, size }, null, 2), image: dataUrl, artifacts: [{ name: "qr-code.png", mime: "image/png", dataUrl }] };
  }
  if (slug === "barcode-generator") {
    if (typeof document === "undefined") throw new ToolError("tool.error.generic");
    const { default: JsBarcode } = await import("jsbarcode");
    const value = F("text", input).trim();
    const format = ["CODE128", "EAN13", "CODE39"].includes(F("mode", "CODE128")) ? F("mode", "CODE128") : "CODE128";
    if (!value) throw new ToolError("tool.error.generic");
    try {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(svg, value, { format, displayValue: true, fontSize: 16, margin: 8 });
      const markup = new XMLSerializer().serializeToString(svg);
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
      return { text: JSON.stringify({ value, format }, null, 2), image: dataUrl, artifacts: [{ name: "barcode.svg", mime: "image/svg+xml", dataUrl }] };
    } catch {
      throw new ToolError("tool.error.generic");
    }
  }
  if (slug === "iban-validator") {
    const { default: IBAN } = await import("iban");
    const value = F("text", input).replace(/\s+/g, "");
    if (!value) throw new ToolError("tool.error.generic");
    return { text: JSON.stringify({ iban: F("text", input).trim(), valid: IBAN.isValid(value) }, null, 2) };
  }
  if (slug === "credit-card-validator") {
    const { default: valid } = await import("card-validator");
    const value = F("text", input).replace(/[\s-]+/g, "");
    if (!value) throw new ToolError("tool.error.generic");
    const result = valid.number(value);
    return { text: JSON.stringify({ valid: result.isValid, card: result.card?.niceType ?? "unknown" }, null, 2) };
  }
  if (slug === "phone-number-parser") {
    const { parsePhoneNumberFromString } = await import("libphonenumber-js");
    const value = F("text", input).trim();
    if (!value) throw new ToolError("tool.error.generic");
    const parsed = parsePhoneNumberFromString(value, (F("country", "BD").toUpperCase() || "BD") as "BD");
    if (!parsed) throw new ToolError("tool.error.generic");
    return {
      text: JSON.stringify(
        { valid: parsed.isValid(), international: parsed.formatInternational(), national: parsed.formatNational(), country: parsed.country, type: parsed.getType() ?? "unknown" },
        null,
        2,
      ),
    };
  }
  if (slug === "vin-checker") {
    const vin = F("text", input).trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return { text: JSON.stringify({ valid: false, reason: "Must be 17 chars, no I/O/Q" }, null, 2) };
    // Standard transliteration + weight table.
    const table: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9, "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9 };
    const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    // Validated 17-char alphabet above: every lookup hits; `?? 0` is type-level only.
    for (let i = 0; i < 17; i += 1) sum += (table[vin[i] ?? ""] ?? 0) * (weights[i] ?? 0);
    const check = sum % 11;
    const expected = check === 10 ? "X" : String(check);
    return { text: JSON.stringify({ valid: vin[8] === expected, checkDigit: vin[8], expected }, null, 2) };
  }
  if (slug === "isbn-validator") {
    const digits = F("text", input).replace(/[^0-9Xx]/g, "");
    if (digits.length === 10) {
      let sum = 0;
      for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
      const ninth = digits[9] ?? "";
      const check = ninth.toUpperCase() === "X" ? 10 : Number(ninth);
      return { text: JSON.stringify({ valid: (sum + check) % 11 === 0, isbn10: digits }, null, 2) };
    }
    if (digits.length === 13) {
      let sum = 0;
      for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
      return { text: JSON.stringify({ valid: (10 - (sum % 10)) % 10 === Number(digits[12]), isbn13: digits }, null, 2) };
    }
    return { text: JSON.stringify({ valid: false, reason: "ISBN-10 needs 10 digits, ISBN-13 needs 13" }, null, 2) };
  }
  return null;
};
