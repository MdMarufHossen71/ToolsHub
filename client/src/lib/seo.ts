/**
 * SEO URL maths and the per-route tag list.
 *
 * Kept as a plain module with no React, no alias imports and no bundler-specific
 * syntax so three callers can share one source of truth:
 *
 *   - `hooks/usePageMeta` applies the tags in the running app;
 *   - `scripts/generate-seo.mjs` renders the same tags into the prerendered shells;
 *   - the unit tests exercise the pure builders.
 *
 * The app is hash-routed (`/#/tools/reverse-text`), but a crawler cannot index a
 * fragment. Every route therefore also has a *clean* path (`/tools/reverse-text/`)
 * served by a static shell, and all canonical/OG URLs point at that clean path.
 */

/** Production origin. Overridable via `VITE_SITE_URL` so preview deploys canonicalise correctly. */
export const DEFAULT_SITE_URL = "https://tools-hub-71.vercel.app";

function resolveSiteUrl(): string {
  const fromVite = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SITE_URL;
  const env = typeof process !== "undefined" ? process.env : undefined;
  const fromNode = env?.VITE_SITE_URL ?? env?.SITE_URL;
  const fromVercel = env?.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : env?.VERCEL_URL
      ? `https://${env.VERCEL_URL}`
      : undefined;
  const raw = (fromVite ?? fromNode ?? fromVercel ?? DEFAULT_SITE_URL).trim();
  return raw.replace(/\/+$/, "");
}

export const SITE_URL = resolveSiteUrl();

export const OG_IMAGE_PATH = "/og-image.png";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_URL = `${SITE_URL}${OG_IMAGE_PATH}`;

export const SITE_NAME = "ToolsHub";

export type Locale = "en" | "bn";

/** Every route the app renders, classified so metadata can be built from data. */
export type RouteKind =
  | "home"
  | "tools"
  | "tool"
  | "games"
  | "game"
  | "links"
  | "ai"
  | "about"
  | "how-to"
  | "privacy"
  | "settings"
  | "changelog"
  | "other";

export type ParsedRoute = {
  kind: RouteKind;
  /** Tool or game slug when `kind` is `tool`/`game`, else null. */
  slug: string | null;
  /** Clean, crawlable path with a trailing slash (`/`, `/tools/`, `/tools/x/`). */
  path: string;
};

const SECTION_PATHS: Record<string, RouteKind> = {
  tools: "tools",
  games: "games",
  links: "links",
  ai: "ai",
  about: "about",
  "how-to": "how-to",
  privacy: "privacy",
  settings: "settings",
  changelog: "changelog",
};

/** Classifies a wouter location (path only, no query) into a route descriptor. */
export function parseRoute(location: string): ParsedRoute {
  const path = (location || "/").split("?")[0] || "/";
  if (path === "/") return { kind: "home", slug: null, path: "/" };

  const segments = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const [first, second] = segments;
  // The root path returned above, so an empty segment list is unreachable;
  // unknown routes canonicalise to home rather than pointing at a URL that 404s.
  if (first === undefined) return { kind: "other", slug: null, path: "/" };

  if (first === "tools" && second) return { kind: "tool", slug: second, path: `/tools/${second}/` };
  if (first === "games" && second) return { kind: "game", slug: second, path: `/games/${second}/` };

  const section = SECTION_PATHS[first];
  if (section) return { kind: section, slug: null, path: `/${first}/` };

  // Unknown routes render the in-app 404. It has no clean path of its own, so it
  // canonicalises to the home page rather than pointing at a URL that 404s.
  return { kind: "other", slug: null, path: "/" };
}

/** Absolute URL for a clean path. */
export function canonicalUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The Bangla shell of a clean path lives under `/bn`, e.g. `/tools/x/` →
 * `/bn/tools/x/`. The hash app itself reads language from storage, so the bn
 * shells serve crawlers and no-JS readers with fully translated copy while the
 * interactive hand-over goes to the same hash route.
 */
export function localizedPath(path: string, locale: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return locale === "bn" ? `/bn${clean}` : clean;
}

/** Absolute URL for a clean path in the given locale. */
export function localizedUrl(path: string, locale: Locale): string {
  return canonicalUrl(localizedPath(path, locale));
}

export function ogLocale(locale: Locale): string {
  return locale === "bn" ? "bn_BD" : "en_US";
}

export type MetaTag =
  | { kind: "meta"; attr: "name" | "property"; key: string; content: string }
  | { kind: "link"; rel: string; href: string; hreflang?: string };

export type PageMetaInput = {
  /** Full document title, without the brand suffix. */
  title: string;
  description: string;
  locale: Locale;
  /** Absolute canonical URL, or null for a route that has none. */
  canonical: string | null;
  /**
   * Absolute per-locale URLs for hreflang alternates. Pass both when the route
   * has bn + en shells; omit (or pass nulls) and no alternate links are emitted.
   */
  alternates?: { en: string | null; bn: string | null } | undefined;
};

function hreflangOf(locale: Locale): string {
  return locale === "bn" ? "bn" : "en";
}

/**
 * The complete tag set every route sets: description, Open Graph, Twitter card and
 * the canonical link. `title` is returned separately because the shells and the hook
 * set `document.title`/`<title>` by different means.
 */
export function buildPageMetaTags(input: PageMetaInput): MetaTag[] {
  const { title, description, locale, canonical, alternates } = input;
  const tags: MetaTag[] = [
    { kind: "meta", attr: "name", key: "description", content: description },
    { kind: "meta", attr: "property", key: "og:title", content: title },
    { kind: "meta", attr: "property", key: "og:description", content: description },
    { kind: "meta", attr: "property", key: "og:type", content: "website" },
    { kind: "meta", attr: "property", key: "og:site_name", content: SITE_NAME },
    { kind: "meta", attr: "property", key: "og:image", content: OG_IMAGE_URL },
    { kind: "meta", attr: "property", key: "og:image:width", content: String(OG_IMAGE_WIDTH) },
    { kind: "meta", attr: "property", key: "og:image:height", content: String(OG_IMAGE_HEIGHT) },
    { kind: "meta", attr: "property", key: "og:locale", content: ogLocale(locale) },
    { kind: "meta", attr: "name", key: "twitter:card", content: "summary_large_image" },
    { kind: "meta", attr: "name", key: "twitter:title", content: title },
    { kind: "meta", attr: "name", key: "twitter:description", content: description },
    { kind: "meta", attr: "name", key: "twitter:image", content: OG_IMAGE_URL },
  ];

  if (canonical) {
    tags.push({ kind: "meta", attr: "property", key: "og:url", content: canonical });
    tags.push({ kind: "link", rel: "canonical", href: canonical });
  }

  // hreflang alternates (plus x-default → English) so crawlers pair each bn
  // shell with its en twin instead of treating translated copy as duplicate.
  const en = alternates?.en ?? null;
  const bn = alternates?.bn ?? null;
  if (en) tags.push({ kind: "link", rel: "alternate", href: en, hreflang: hreflangOf("en") });
  if (bn) tags.push({ kind: "link", rel: "alternate", href: bn, hreflang: hreflangOf("bn") });
  if (en ?? bn) tags.push({ kind: "link", rel: "alternate", href: (en ?? bn) as string, hreflang: "x-default" });

  return tags;
}

/** Section routes that get a prerendered shell and a sitemap entry. */
export const SECTION_ROUTES: ReadonlyArray<{ kind: RouteKind; path: string }> = [
  { kind: "tools", path: "/tools/" },
  { kind: "games", path: "/games/" },
  { kind: "links", path: "/links/" },
  { kind: "ai", path: "/ai/" },
  { kind: "about", path: "/about/" },
  { kind: "how-to", path: "/how-to/" },
  { kind: "privacy", path: "/privacy/" },
  { kind: "changelog", path: "/changelog/" },
];
