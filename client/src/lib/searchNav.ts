/**
 * Navigation for the search fields, defined once.
 *
 * The header, the drawer and the home hero all submit the same way, but the hero used
 * to reach the tools directory only through the browser's implicit form submission
 * (there is no submit button to click). That made its destination depend on form markup
 * rather than on an explicit handler, so the hero and header could drift apart. Enter is
 * now resolved here, and the tools-directory URL is built here, so no caller has to
 * repeat the string.
 */

/** The tools directory filtered by `query`. Trims, so a stray space never becomes a search. */
export function toolsSearchHref(query: string): string {
  return `/tools?search=${encodeURIComponent(query.trim())}`;
}

/**
 * What Enter does in a search field:
 *   - a highlighted suggestion opens that tool;
 *   - otherwise a non-empty query goes to the filtered directory;
 *   - an empty query does nothing rather than navigating to an empty search.
 */
export type SearchEnterAction =
  | { type: "open-tool"; slug: string }
  | { type: "submit" }
  | { type: "none" };

export function resolveSearchEnter(query: string, highlightedSlug: string | null): SearchEnterAction {
  if (highlightedSlug !== null) return { type: "open-tool", slug: highlightedSlug };
  return query.trim() ? { type: "submit" } : { type: "none" };
}
