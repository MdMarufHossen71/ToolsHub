/**
 * Build-time SEO artifact generator.
 *
 * Runs after `vite build`, against `dist/public`, and writes:
 *
 *   - a crawlable static shell for every tool and game clean path
 *     (`/tools/<slug>/index.html`, `/games/<slug>/index.html`);
 *   - a shell for each section route listed in the sitemap
 *     (`/tools/`, `/games/`, `/links/`, `/ai/`, `/about/`, `/how-to/`, `/privacy/`);
 *   - the same shells translated under `/bn` (`/bn/tools/<slug>/`, …) plus a
 *     Bangla home shell at `/bn/` (the English home is `index.html` itself);
 *   - `sitemap.xml` and `robots.txt`.
 *
 * Every string is taken from the same sources the app renders — `client/src/data/
 * tools.ts`, `toolDescriptions.ts`, `games.ts`, `client/src/lib/toolGuide.ts` and the
 * translation dictionary — so a shell cannot drift from the page it mirrors.
 *
 * Any failure throws, which makes the `pnpm run build` chain exit non-zero: a build
 * that cannot write its own crawlable pages fails loudly rather than shipping
 * silently missing half of them.
 *
 * Run with:  node --experimental-strip-types scripts/generate-seo.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toolRegistry } from "../client/src/data/tools.ts";
import { gameRegistry } from "../client/src/data/games.ts";
import { IMPLEMENTED_TOOLS } from "../client/src/lib/implementedTools.ts";
import { guideKind, toolGuideSteps } from "../client/src/lib/toolGuide.ts";
import { translations, interpolate } from "../client/src/i18n/translations.ts";
import { SITE_URL, SECTION_ROUTES, buildPageMetaTags, canonicalUrl, localizedUrl } from "../client/src/lib/seo.ts";
import { buildJsonLdGraph, gameNodes, toolNodes, websiteNode } from "../client/src/lib/structuredData.ts";
import { renderShellHtml } from "../client/src/lib/seoShell.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist", "public");
const INDEX = path.join(DIST, "index.html");
const LAST_MOD = new Date().toISOString().slice(0, 10);

/** Every locale the shells are generated in. Tool names stay English; copy is translated. */
const LOCALES = ["en", "bn"];

if (!existsSync(INDEX)) throw new Error(`[seo] ${INDEX} is missing — run this after \`vite build\``);
const indexHtml = readFileSync(INDEX, "utf8");

/** The emitted stylesheet, as an absolute path so a shell one level down still loads it. */
const stylesheetHref = (() => {
  const match = indexHtml.match(/<link[^>]+rel="stylesheet"[^>]+href="\.\/([^"]+\.css)"/) ?? indexHtml.match(/<link[^>]+href="\.\/([^"]+\.css)"[^>]+rel="stylesheet"/);
  return match ? `/${match[1]}` : null;
})();

const t = (key, locale = "en", values) => interpolate(translations[locale][key] ?? String(key), values);

let written = 0;
function writeShell(urlPath, html) {
  const dir = path.join(DIST, urlPath.replace(/^\/+|\/+$/g, ""));
  const file = path.join(dir, "index.html");
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, html);
  if (!existsSync(file) || readFileSync(file).length === 0) throw new Error(`[seo] failed to write ${file}`);
  written += 1;
}

/** hreflang pair for a clean path: self-canonical per locale, cross-linked. */
function alternatesFor(urlPath) {
  return { en: canonicalUrl(urlPath), bn: localizedUrl(urlPath, "bn") };
}

/** Output path for a locale: English at the clean path, Bangla under `/bn`. */
function outPath(locale, urlPath) {
  return locale === "bn" ? `/bn${urlPath}` : urlPath;
}

for (const locale of LOCALES) {
  // --- Tools ------------------------------------------------------------------
  for (const tool of toolRegistry) {
    const kind = guideKind(tool.slug, IMPLEMENTED_TOOLS.has(tool.slug));
    const description = tool.description[locale] ?? tool.description.en;
    const urlPath = `/tools/${tool.slug}/`;
    const canonical = canonicalUrl(outPath(locale, urlPath));
    const steps = toolGuideSteps(tool, locale, kind).map((item) => t(item.key, locale, item.values));
    const howTo = steps.length > 0 ? steps : [t("tool.unavailable.copy", locale)];

    const html = renderShellHtml({
      title: `${tool.name} · ToolsHub`,
      description,
      metaTags: buildPageMetaTags({ title: `${tool.name} · ToolsHub`, description, locale, canonical, alternates: alternatesFor(urlPath) }),
      jsonLd: buildJsonLdGraph(toolNodes(tool, locale, { home: t("seo.breadcrumbHome", locale), section: t("nav.tools", locale) })),
      lang: locale,
      h1: tool.name,
      intro: [],
      sections: [
        { heading: t("tool.guide.aboutTitle", locale), paragraphs: [description, t(`tool.guide.about.${kind}`, locale), `${t("tool.guide.notDo", locale)} ${t("tool.guide.privacy", locale)}`] },
        { heading: t("tool.guide.howTitle", locale), steps: howTo },
      ],
      redirectTo: `/#${urlPath.replace(/\/$/, "")}`,
      stylesheetHref,
      openLabel: t("seo.openInApp", locale),
      noscriptNote: t("seo.shell.noscript", locale),
    });
    writeShell(outPath(locale, urlPath), html);
  }

  // --- Games ------------------------------------------------------------------
  for (const game of gameRegistry) {
    const description = game.description[locale] ?? game.description.en;
    const urlPath = `/games/${game.slug}/`;
    const canonical = canonicalUrl(outPath(locale, urlPath));

    const html = renderShellHtml({
      title: `${game.name} · ToolsHub`,
      description,
      metaTags: buildPageMetaTags({ title: `${game.name} · ToolsHub`, description, locale, canonical, alternates: alternatesFor(urlPath) }),
      jsonLd: buildJsonLdGraph(gameNodes(game, locale, { home: t("seo.breadcrumbHome", locale), section: t("nav.games", locale) })),
      lang: locale,
      h1: game.name,
      intro: [description],
      sections: [
        {
          heading: t("seo.gameAbout", locale),
          paragraphs: [`${t("seo.gameGenre", locale)}: ${game.genre}.`, t("seo.gameLocal", locale)],
        },
      ],
      redirectTo: `/#${urlPath.replace(/\/$/, "")}`,
      stylesheetHref,
      openLabel: t("seo.openInApp", locale),
      noscriptNote: t("seo.shell.noscript", locale),
    });
    writeShell(outPath(locale, urlPath), html);
  }

  // --- Section routes -----------------------------------------------------------
  const SECTION_COPY = {
    tools: { title: "tools.title", copy: "tools.copy" },
    games: { title: "games.title", copy: "games.copy" },
    links: { title: "links.title", copy: "links.copy" },
    ai: { title: "ai.title", copy: "ai.copy" },
    about: { title: "static.about.title", copy: "static.about.copy" },
    "how-to": { title: "static.how.title", copy: "static.how.copy" },
    privacy: { title: "static.privacy.title", copy: "static.privacy.copy" },
    changelog: { title: "changelog.title", copy: "changelog.copy" },
  };

  for (const route of SECTION_ROUTES) {
    const copy = SECTION_COPY[route.kind];
    if (!copy) throw new Error(`[seo] no shell copy mapped for section "${route.kind}"`);
    const title = t(copy.title, locale);
    const description = t(copy.copy, locale);
    const canonical = canonicalUrl(outPath(locale, route.path));

    const html = renderShellHtml({
      title: `${title} · ToolsHub`,
      description,
      metaTags: buildPageMetaTags({ title: `${title} · ToolsHub`, description, locale, canonical, alternates: alternatesFor(route.path) }),
      jsonLd: null,
      lang: locale,
      h1: title,
      intro: [description],
      sections: [],
      redirectTo: `/#${route.path.replace(/\/$/, "")}`,
      stylesheetHref,
      openLabel: t("seo.openInApp", locale),
      noscriptNote: t("seo.shell.noscript", locale),
    });
    writeShell(outPath(locale, route.path), html);
  }
}

// --- Bangla home shell (English home is index.html itself) ----------------------
{
  const locale = "bn";
  const title = `${t("home.metaTitle", locale)} · ToolsHub`;
  const description = t("home.copy", locale);
  const html = renderShellHtml({
    title,
    description,
    metaTags: buildPageMetaTags({
      title,
      description,
      locale,
      canonical: canonicalUrl("/bn/"),
      alternates: { en: canonicalUrl("/"), bn: canonicalUrl("/bn/") },
    }),
    jsonLd: buildJsonLdGraph([websiteNode({ description, locale })]),
    lang: locale,
    h1: title,
    intro: [description],
    sections: [],
    redirectTo: "/#",
    stylesheetHref,
    openLabel: t("seo.openInApp", locale),
    noscriptNote: t("seo.shell.noscript", locale),
  });
  writeShell("/bn/", html);
}

const perLocale = toolRegistry.length + gameRegistry.length + SECTION_ROUTES.length;
if (written !== perLocale * LOCALES.length + 1) {
  throw new Error(`[seo] wrote ${written} shells, expected ${perLocale * LOCALES.length + 1}`);
}

// --- sitemap.xml + robots.txt ---------------------------------------------------
const enPaths = [
  "/",
  ...SECTION_ROUTES.map((route) => route.path),
  ...toolRegistry.map((tool) => `/tools/${tool.slug}/`),
  ...gameRegistry.map((game) => `/games/${game.slug}/`),
];
const urls = [...enPaths.map((p) => canonicalUrl(p)), ...enPaths.filter((p) => p !== "/").map((p) => localizedUrl(p, "bn")), canonicalUrl("/bn/")];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
  .map((url) => `  <url><loc>${url}</loc><lastmod>${LAST_MOD}</lastmod></url>`)
  .join("\n")}\n</urlset>\n`;
writeFileSync(path.join(DIST, "sitemap.xml"), sitemap);
writeFileSync(
  path.join(DIST, "robots.txt"),
  `# ToolsHub - ${SITE_URL}\n# Every tool and game has a crawlable static shell at its clean path.\nUser-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);

console.log(
  `[seo] wrote ${written} shells (${toolRegistry.length} tools ×2, ${gameRegistry.length} games ×2, ${SECTION_ROUTES.length} sections ×2, bn home) and sitemap.xml with ${urls.length} URLs; stylesheet=${stylesheetHref ?? "none"}`,
);
