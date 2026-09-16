/** Cobalt Workshop design reminder: filters behave like labeled instrument trays, with results always visible and confidently navigable. */
import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useSearch } from "wouter";
import { ToolCard } from "@/components/ToolCard";
import { categories, toolRegistry, type ToolGroup } from "@/data/tools";
import { searchTools } from "@/lib/toolSearch";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { usePageMeta } from "@/hooks/usePageMeta";

const groupIds = new Set(categories.map((category) => category.id as string));

export default function Tools() {
  const { t, language } = useTranslation();
  usePageMeta("tools.title", "tools.copy");

  // Read from the router rather than `window.location.hash`. The old code parsed the
  // hash for a query string that path-based routing never produced, so the header
  // search and the home page's category links both silently did nothing.
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const searchParam = params.get("search") ?? "";
  const categoryParam = params.get("category") ?? "";

  const [query, setQuery] = useState(searchParam);
  const [group, setGroup] = useState<ToolGroup | "all">(groupIds.has(categoryParam) ? (categoryParam as ToolGroup) : "all");

  // Keep in sync with later navigations to the same route (search box in the header,
  // category trays on the home page) — the component is not remounted for those.
  useEffect(() => {
    setQuery(searchParam);
  }, [searchParam]);
  useEffect(() => {
    setGroup(groupIds.has(categoryParam) ? (categoryParam as ToolGroup) : "all");
  }, [categoryParam]);

  const results = useMemo(() => {
    // Ranked search keeps "json csv" → JSON to CSV TSV first; the group chip
    // then filters that ranked list so ordering survives category selection.
    if (!query.trim()) return toolRegistry.filter((tool) => group === "all" || tool.group === group);
    return searchTools(query, toolRegistry.length).filter((tool) => group === "all" || tool.group === group);
  }, [group, query]);

  return (
    <div className="site-frame page-space">
      <div className="page-intro">
        <p className="eyebrow">{t("tools.eyebrow")}</p>
        <h1>{t("tools.title")}</h1>
        <p>{t("tools.copy")}</p>
      </div>
      <div className="directory-bar">
        <div className="search-field">
          <Search className="size-4" aria-hidden="true" />
          <label className="sr-only" htmlFor="tools-search">
            {t("search.aria")}
          </label>
          <input id="tools-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search.placeholder")} />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label={t("common.clearSearch")}>
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="directory-count" role="status">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {t("tools.resultCount", { count: results.length })}
        </p>
      </div>
      <div className="filter-rail" role="group" aria-label={t("tools.filterLabel")}>
        <button type="button" className={group === "all" ? "filter-chip active" : "filter-chip"} aria-pressed={group === "all"} onClick={() => setGroup("all")}>
          {t("tools.all")}
        </button>
        {categories.map((category) => (
          <button key={category.id} type="button" className={group === category.id ? "filter-chip active" : "filter-chip"} aria-pressed={group === category.id} onClick={() => setGroup(category.id)}>
            {language === "bn" ? category.bn : category.label}
          </button>
        ))}
      </div>
      {results.length ? (
        <>
          {/* Tool cards are `h3`, matching their level on the home page where a section
              `h2` sits above them. This page has no such section heading, so without
              this the outline jumped straight from `h1` to `h3`. It carries nothing a
              sighted user needs, so it is exposed to assistive technology only — and it
              sits outside the grid, because an extra grid child would disturb the
              featured-card rhythm. */}
          <h2 className="sr-only">{t("tools.resultsHeading")}</h2>
          <div className="tool-grid directory-grid">
            {results.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} featured={group === "all" && !query.trim() && tool.featured} />
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state" role="status">
          <p>{t("tools.empty")}</p>
          <div className="bench-actions bench-actions-center">
            <button
              type="button"
              className="filter-chip"
              onClick={() => {
                setQuery("");
                setGroup("all");
              }}
            >
              {t("common.clearSearch")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
