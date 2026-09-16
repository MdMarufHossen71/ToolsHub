/**
 * Friendly rendering for every tool result.
 *
 * Most runners return `text` as `JSON.stringify(...)` because it is honest and
 * copy-pasteable — but a code block is not how most people read an answer. This
 * module upgrades all of them at once, without touching any runner:
 *
 * - a flat JSON object becomes labeled value cards (`Line Numberer`, `BMI`, ...),
 * - a JSON array of scalars becomes a clean list,
 * - a `table` stays a real table (with CSV copy/download),
 * - anything nested or unparseable keeps the exact raw `<pre>` as before,
 *   one click away behind a "raw data" toggle.
 *
 * Copy/download helpers speak the same language: tables leave as CSV, JSON
 * leaves as `.json`, everything else as before.
 */
import type { ToolResult } from "@/lib/toolOperations";

export type ResultCard = { label: string; value: string };

/** `camelCase`, `snake_case` and `kebab-case` keys become "Human Labels". */
export function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^\s*\w/, (char) => char.toUpperCase());
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function scalarText(value: string | number | boolean | null, yes: string, no: string): string {
  if (typeof value === "boolean") return value ? `✓ ${yes}` : `✕ ${no}`;
  if (value === null) return "—";
  return String(value);
}

function flattenValue(value: unknown, yes: string, no: string): string | null {
  if (isScalar(value)) return scalarText(value, yes, no);
  // One level of nesting (e.g. word-counter `topWords`) flattens to
  // `paste ×1, or ×1` instead of forcing the whole answer back to raw JSON.
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0 || entries.length > 12) return null;
    const parts: string[] = [];
    for (const [key, nested] of entries) {
      if (!isScalar(nested)) return null;
      parts.push(typeof nested === "number" ? `${key} ×${nested}` : `${key}: ${scalarText(nested, yes, no)}`);
    }
    return parts.join(", ");
  }
  return null;
}

export type FriendlyData = { kind: "cards"; cards: ResultCard[] } | { kind: "list"; items: string[] };

/**
 * Returns a card/list view for flat JSON, or `null` when the text should stay
 * exactly as the runner wrote it. Pure and unit-tested (`resultView.test.ts`).
 */
export function parseFriendlyJson(text: string, yes = "Yes", no = "No"): FriendlyData | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0 || parsed.length > 200 || !parsed.every(isScalar)) return null;
    return { kind: "list", items: parsed.map((item) => scalarText(item, yes, no)) };
  }
  if (parsed && typeof parsed === "object") {
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0 || entries.length > 24) return null;
    const cards: ResultCard[] = [];
    for (const [key, value] of entries) {
      const flat = flattenValue(value, yes, no);
      if (flat === null) return null;
      cards.push({ label: humanizeKey(key), value: flat });
    }
    return { kind: "cards", cards };
  }
  return null;
}

/** Escape one CSV cell. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function tableToCsv(table: NonNullable<ToolResult["table"]>): string {
  return [table.head, ...table.rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function cardsToText(cards: ResultCard[]): string {
  return cards.map((card) => `${card.label}: ${card.value}`).join("\n");
}

/** What the Copy button puts on the clipboard for a result. */
export function copyTextForOutput(output: ToolResult, yes = "Yes", no = "No"): string {
  if (output.table && output.table.rows.length > 0) return tableToCsv(output.table);
  const friendly = parseFriendlyJson(output.text, yes, no);
  if (friendly?.kind === "cards") return cardsToText(friendly.cards);
  if (friendly?.kind === "list") return friendly.items.join("\n");
  return output.text;
}

/** What the Download button saves: CSV for tables, JSON for JSON, else as before. */
export function downloadForOutput(
  output: ToolResult,
  slug: string,
): { filename: string; mime: string; content: string } {
  if (output.table && output.table.rows.length > 0) {
    return { filename: `${slug}-result.csv`, mime: "text/csv", content: tableToCsv(output.table) };
  }
  const trimmed = output.text.trim();
  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && parseFriendlyJson(output.text) !== null) {
    return { filename: `${slug}-result.json`, mime: "application/json", content: output.text };
  }
  try {
    JSON.parse(trimmed);
    return { filename: `${slug}-result.json`, mime: "application/json", content: output.text };
  } catch {
    // Plain text: fall through.
  }
  if (output.html) return { filename: `${slug}-result.html`, mime: "text/html", content: output.text };
  return { filename: `${slug}-result.txt`, mime: "text/plain", content: output.text };
}
