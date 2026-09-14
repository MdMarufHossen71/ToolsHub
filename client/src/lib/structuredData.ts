/**
 * JSON-LD builders.
 *
 * Pure functions returning plain objects, so the same graph is injected by
 * `usePageMeta` in the running app and written into the prerendered shells by
 * `scripts/generate-seo.mjs`. Every node is built from the real registries — the
 * tool/game name, description, genre and clean URL — rather than restated by hand.
 *
 * The unit tests `JSON.parse(JSON.stringify(graph))` the output, which proves the
 * payload is valid JSON before it is ever put inside a `<script>`.
 */
import { SITE_URL, canonicalUrl, type Locale } from "./seo.ts";
import type { Tool } from "../data/tools.ts";
import type { Game } from "../data/games.ts";

export type JsonLdNode = Record<string, unknown>;

export type BreadcrumbLabels = {
  home: string;
  section: string;
};

/** Wraps nodes in a single graph, which is what one `<script>` can carry. */
export function buildJsonLdGraph(nodes: JsonLdNode[]): JsonLdNode {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/** Home-page site object. The SearchAction targets the app's hash search route. */
export function websiteNode(input: { description: string; locale: Locale }): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "ToolsHub",
    url: `${SITE_URL}/`,
    description: input.description,
    inLanguage: input.locale,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/#/tools?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

function breadcrumb(items: Array<{ name: string; url: string }>): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** WebApplication + BreadcrumbList for one tool. */
export function toolNodes(tool: Tool, locale: Locale, labels: BreadcrumbLabels): JsonLdNode[] {
  const url = canonicalUrl(`/tools/${tool.slug}/`);
  return [
    {
      "@type": "WebApplication",
      "@id": `${url}#app`,
      name: tool.name,
      url,
      description: tool.description[locale] || tool.description.en,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      isAccessibleForFree: true,
      inLanguage: locale,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    breadcrumb([
      { name: labels.home, url: `${SITE_URL}/` },
      { name: labels.section, url: `${SITE_URL}/tools/` },
      { name: tool.name, url },
    ]),
  ];
}

/** VideoGame + BreadcrumbList for one game. */
export function gameNodes(game: Game, locale: Locale, labels: BreadcrumbLabels): JsonLdNode[] {
  const url = canonicalUrl(`/games/${game.slug}/`);
  return [
    {
      "@type": "VideoGame",
      "@id": `${url}#game`,
      name: game.name,
      url,
      description: game.description[locale] || game.description.en,
      genre: game.genre,
      applicationCategory: "Game",
      operatingSystem: "Any",
      playMode: "SinglePlayer",
      isAccessibleForFree: true,
      inLanguage: locale,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    breadcrumb([
      { name: labels.home, url: `${SITE_URL}/` },
      { name: labels.section, url: `${SITE_URL}/games/` },
      { name: game.name, url },
    ]),
  ];
}
