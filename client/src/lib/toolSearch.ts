/**
 * Ranking for the search suggestion panels in the header and the home hero.
 *
 * `fuzzyMatch` in `data/tools.ts` answers "does this tool match at all" and is the
 * fallback here; it is deliberately permissive, so it cannot order a result list. The
 * scores below are what make a suggestion panel useful: a tool whose name starts with
 * what was typed must come before one that merely mentions the word in its category
 * or description, and a Bangla query has to match the Bangla fields even though tool
 * names stay Latin.
 *
 * Multi-word queries are tokenized (`"json csv"` → `["json","csv"]`) so
 * "JSON to CSV TSV" outranks tools matching only one token. Weights follow the
 * platform spec (exact 100 / prefix 80 / name-substring 60 / keyword 40 /
 * name-token 30 / category 20 / description 15 / fuzzy 10); per-token bonuses sum,
 * so a two-token name match beats two single-token matches deterministically.
 *
 * Results are memoized by query because this runs on every keystroke over the whole
 * ~283-tool registry.
 */
import { fuzzyMatch, toolRegistry } from "@/data/tools";
import type { Tool } from "@/data/tools";

/** Most suggestions a panel ever shows. */
export const SEARCH_SUGGESTION_LIMIT = 6;

/** How many distinct queries are remembered. Enough for a typing session, bounded. */
const MEMO_LIMIT = 64;

const memo = new Map<string, Tool[]>();

/** Collapse extra spaces, lowercase. Bangla has no case but this is a no-op there. */
function normalize(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokensOf(needle: string): string[] {
  return needle.split(" ").filter(Boolean);
}

/**
 * Deterministic weighted score (higher sorts first).
 * Returns `null` when the tool does not match at all.
 */
function scoreTool(tool: Tool, needle: string, tokens: string[]): number | null {
  const name = tool.name.toLowerCase();
  let score = 0;

  // Full-query name bonuses (strongest signals).
  if (name === needle) score += 100;
  else if (name.startsWith(needle)) score += 80;
  else if (name.includes(needle)) score += 60;

  const keywords = tool.keywords.join(" ").toLowerCase();
  const keywordSet = new Set(tool.keywords.map((k) => k.toLowerCase()));
  const category = `${tool.category} ${tool.categoryBn}`.toLowerCase();
  const description = `${tool.description.en} ${tool.description.bn}`.toLowerCase();

  for (const token of tokens) {
    let matched = false;
    // Exact keyword word match (keywords include name + category words).
    if (keywordSet.has(token)) {
      score += 40;
      matched = true;
    }
    // Name token substring rewards multi-word name hits ("json csv" → both).
    if (name.includes(token)) {
      score += 30;
      matched = true;
    } else if (keywords.includes(token)) {
      // Substring fallback for compound keywords (e.g. partial word).
      score += 20;
      matched = true;
    }
    if (category.includes(token)) {
      score += 20;
      matched = true;
    }
    if (description.includes(token)) {
      score += 15;
      matched = true;
    }
    if (!matched && fuzzyMatch(tool, token)) {
      score += 10;
      matched = true;
    }
    void matched;
  }

  // Whole-needle fuzzy fallback for single-token subsequence queries ("jsn" → json).
  if (score === 0) {
    return fuzzyMatch(tool, needle) ? 10 : null;
  }
  return score;
}

function compute(query: string, limit: number): Tool[] {
  const needle = normalize(query);
  if (!needle) return [];
  const tokens = tokensOf(needle);

  const ranked: Array<{ tool: Tool; score: number }> = [];
  const seen = new Set<string>();
  for (const tool of toolRegistry) {
    const score = scoreTool(tool, needle, tokens);
    if (score !== null && !seen.has(tool.slug)) {
      seen.add(tool.slug);
      ranked.push({ tool, score });
    }
  }
  // Higher score first; slug tiebreak keeps order deterministic across builds
  // (code-point comparison, not localeCompare, so ICU data cannot vary it).
  ranked.sort((a, b) => b.score - a.score || (a.tool.slug < b.tool.slug ? -1 : a.tool.slug > b.tool.slug ? 1 : 0));
  return ranked.slice(0, limit).map((entry) => entry.tool);
}

/** Ranked matches for `query`, capped at `limit` (the suggestion cap by default). */
export function searchTools(query: string, limit = SEARCH_SUGGESTION_LIMIT): Tool[] {
  if (!query.trim()) return [];
  const key = `${limit}\u0000${normalize(query)}`;
  const cached = memo.get(key);
  if (cached) return cached;
  const result = compute(query, limit);
  // A coarse reset is cheaper than tracking recency, and an empty cache only costs one
  // recomputation of the query that follows it.
  if (memo.size >= MEMO_LIMIT) memo.clear();
  memo.set(key, result);
  return result;
}
