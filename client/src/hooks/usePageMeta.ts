/**
 * Per-route document metadata.
 *
 * Every route sets a title, description, canonical link, Open Graph and Twitter
 * card, and the matching JSON-LD graph. Values are derived from the route and the
 * real registries, and they follow the language toggle where they are content.
 *
 * The tags this hook creates are tagged in a module-local list and removed on the
 * next run, so a navigation can never leave a previous route's OG URL or JSON-LD
 * behind. Tags that already exist in `index.html` (the description) are updated in
 * place rather than duplicated.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { TranslationKey } from "@/i18n/translations";
import { findTool } from "@/data/tools";
import { findGame } from "@/data/games";
import { buildPageMetaTags, canonicalUrl, localizedUrl, parseRoute, type MetaTag } from "@/lib/seo";
import { buildJsonLdGraph, gameNodes, toolNodes, websiteNode, type JsonLdNode } from "@/lib/structuredData";

const BRAND = "ToolsHub";

type ManagedElement = HTMLMetaElement | HTMLLinkElement | HTMLScriptElement;

/** Elements this hook created (never ones already present in the document). */
let created: ManagedElement[] = [];

function clearCreated() {
  for (const element of created) element.remove();
  created = [];
}

function upsertMeta(tag: Extract<MetaTag, { kind: "meta" }>) {
  const selector = `meta[${tag.attr}="${tag.key}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(tag.attr, tag.key);
    document.head.appendChild(element);
    created.push(element);
  }
  element.setAttribute("content", tag.content);
}

function upsertLink(tag: Extract<MetaTag, { kind: "link" }>) {
  // hreflang alternates share `rel="alternate"`, so the selector must include
  // it — otherwise the bn link would overwrite the en one on every navigation.
  const selector = tag.hreflang ? `link[rel="${tag.rel}"][hreflang="${tag.hreflang}"]` : `link[rel="${tag.rel}"]`;
  let element = document.head.querySelector<HTMLLinkElement>(selector);
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", tag.rel);
    if (tag.hreflang) element.setAttribute("hreflang", tag.hreflang);
    document.head.appendChild(element);
    created.push(element);
  }
  element.setAttribute("href", tag.href);
}

function injectJsonLd(graph: JsonLdNode) {
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(graph);
  document.head.appendChild(script);
  created.push(script);
}

export function usePageMeta(titleKey: TranslationKey, descriptionKey?: TranslationKey, suffix?: string) {
  const { t, language } = useTranslation();
  const [location] = useLocation();

  useEffect(() => {
    const route = parseRoute(location);
    const tool = route.kind === "tool" && route.slug ? findTool(route.slug) : undefined;
    const game = route.kind === "game" && route.slug ? findGame(route.slug) : undefined;

    const baseTitle = suffix ? `${suffix} · ${t(titleKey)}` : t(titleKey);
    const title = tool ? `${tool.name} · ${BRAND}` : game ? `${game.name} · ${BRAND}` : `${baseTitle} · ${BRAND}`;
    const description = tool
      ? tool.description[language] || tool.description.en
      : game
        ? game.description[language] || game.description.en
        : descriptionKey
          ? t(descriptionKey)
          : t(titleKey);

    const hasEntity = route.kind !== "tool" && route.kind !== "game" ? true : Boolean(tool || game);
    const canonical = route.kind === "other" || !hasEntity ? null : canonicalUrl(route.path);
    const alternates =
      route.kind === "other" || !hasEntity
        ? undefined
        : { en: localizedUrl(route.path, "en"), bn: localizedUrl(route.path, "bn") };

    document.title = title;
    clearCreated();

    for (const tag of buildPageMetaTags({ title, description, locale: language, canonical, alternates })) {
      if (tag.kind === "meta") upsertMeta(tag);
      else upsertLink(tag);
    }

    const breadcrumbs = { home: t("seo.breadcrumbHome"), section: t("nav.tools") };
    let graph: JsonLdNode | null = null;
    if (route.kind === "home") graph = buildJsonLdGraph([websiteNode({ description: t("home.copy"), locale: language })]);
    else if (tool) graph = buildJsonLdGraph(toolNodes(tool, language, breadcrumbs));
    else if (game) graph = buildJsonLdGraph(gameNodes(game, language, { home: t("seo.breadcrumbHome"), section: t("nav.games") }));
    if (graph) injectJsonLd(graph);

    return clearCreated;
  }, [t, titleKey, descriptionKey, suffix, language, location]);
}
