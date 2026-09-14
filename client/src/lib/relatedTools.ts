/**
 * Chooses the up-to-six tools shown under a tool page.
 *
 * The goal is a section that is never empty and never nonsense: the same group comes
 * first, ranked by how much of the name and keywords the tools share, then the rest of
 * the registry backfills so a one-tool group still shows a full row. Ordering is fully
 * deterministic — a stable tiebreak on slug means the same page renders the same list
 * on every build and in tests.
 */
import type { Tool } from "@/data/tools";

/** Words worth matching on: single characters and pure numbers carry no signal. */
function tokensOf(tool: Tool): Set<string> {
  const words = `${tool.name} ${tool.keywords.join(" ")}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !/^\d+$/.test(word));
  return new Set(words);
}

function overlap(left: Set<string>, right: Set<string>): number {
  let count = 0;
  // `forEach` rather than `for…of`: the project's TS target does not enable Set
  // iteration, and this module must typecheck like the rest of the app.
  left.forEach((word) => {
    if (right.has(word)) count += 1;
  });
  return count;
}

/** Code-point comparison, not `localeCompare`, so the order cannot vary with ICU data. */
function bySlug(a: Tool, b: Tool): number {
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

export function relatedTools(slug: string, tools: Tool[], limit = 6): Tool[] {
  const current = tools.find((tool) => tool.slug === slug);
  if (!current) return [];
  const wanted = Math.max(0, limit);
  const currentTokens = tokensOf(current);
  const score = (tool: Tool) => overlap(currentTokens, tokensOf(tool));
  // Highest overlap first, then a stable alphabetical order for equal scores.
  const rank = (a: Tool, b: Tool) => score(b) - score(a) || bySlug(a, b);

  const candidates = tools.filter((tool) => tool.slug !== slug);
  const sameGroup = candidates.filter((tool) => tool.group === current.group).sort(rank);
  const otherGroups = candidates.filter((tool) => tool.group !== current.group).sort(rank);

  const out: Tool[] = [];
  const seen = new Set<string>();
  const take = (tool: Tool) => {
    if (out.length >= wanted || seen.has(tool.slug)) return;
    seen.add(tool.slug);
    out.push(tool);
  };
  for (const tool of sameGroup) take(tool);
  // Only reached when the group has fewer entries than the limit (or none, should the
  // registry ever hold a single-tool group) — the section stays full either way.
  for (const tool of otherGroups) {
    if (out.length >= wanted) break;
    take(tool);
  }
  return out;
}
