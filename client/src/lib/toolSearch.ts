/**
 * Ranking for the search suggestion panels in the header and the home hero.
 *
 * `fuzzyMatch` in `data/tools.ts` answers "does this tool match at all" and is the
 * fallback here; it is deliberately permissive, so it cannot order a result list. The
 * order below is what makes a suggestion panel useful: a tool whose name starts with
 * what was typed must come before one that merely mentions the word in its category
 * or description, and a Bangla query has to match the Bangla fields even though tool
 * names stay Latin.
 *
 * Results are memoized by query because this runs on every keystroke over the whole
 * ~287-tool registry.
 */
import { fuzzyMatch, toolRegistry } from "@/data/tools";
import type { Tool } from "@/data/tools";

/** Most suggestions a panel ever shows. */
export const SEARCH_SUGGESTION_LIMIT = 6;

/** How many distinct queries are remembered. Enough for a typing session, bounded. */
const MEMO_LIMIT = 64;

const memo = new Map<string, Tool[]>();

/**
 * Lower score sorts first:
 *   0 exact name, 1 name prefix, 2 name substring,
 *   3 category / description / keyword, 4 fuzzy fallback.
 * Returns `null` when the tool does not match at all.
 */
function rankTool(tool: Tool, needle: string): number | null {
  const name = tool.name.toLowerCase();
  if (name === needle) return 0;
  if (name.startsWith(needle)) return 1;
  if (name.includes(needle)) return 2;

  const fields = [tool.category, tool.categoryBn, tool.description.en, tool.description.bn, tool.keywords.join(" ")];
  for (const field of fields) {
    if (field.toLowerCase().includes(needle)) return 3;
  }

  // `fuzzyMatch` re-derives its own haystack but takes the raw query, so it keeps the
  // behaviour the directory page already has.
  return fuzzyMatch(tool, needle) ? 4 : null;
}

function compute(query: string, limit: number): Tool[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const ranked: Array<{ tool: Tool; rank: number }> = [];
  for (const tool of toolRegistry) {
    const rank = rankTool(tool, needle);
    if (rank !== null) ranked.push({ tool, rank });
  }
  // `Array.prototype.sort` is stable, so tools of equal rank stay in registry order
  // instead of shuffling on every keystroke.
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.slice(0, limit).map((entry) => entry.tool);
}

/** Ranked matches for `query`, capped at `limit` (the suggestion cap by default). */
export function searchTools(query: string, limit = SEARCH_SUGGESTION_LIMIT): Tool[] {
  if (!query.trim()) return [];
  const key = `${limit}\u0000${query.trim().toLowerCase()}`;
  const cached = memo.get(key);
  if (cached) return cached;
  const result = compute(query, limit);
  // A coarse reset is cheaper than tracking recency, and an empty cache only costs one
  // recomputation of the query that follows it.
  if (memo.size >= MEMO_LIMIT) memo.clear();
  memo.set(key, result);
  return result;
}
