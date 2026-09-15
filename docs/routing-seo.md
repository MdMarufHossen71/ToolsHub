# Routing & SEO strategy (hash + prerendered shells)

## Decision: keep hash routing, do NOT migrate to path routing

The app uses hash routing (`/#/tools/<slug>`) via `client/src/lib/hashLocation.ts`
and `client/src/App.tsx`. This is deliberate for static hosting (GitHub Pages has
no rewrite rules; a path deep-link or refresh would return the host's own 404).

A full migration to path-based SPA routing (`/tools/<slug>` served by `index.html`
via rewrites) was evaluated and rejected because:

1. `scripts/generate-seo.mjs` already emits a real static file per clean path
   (`dist/public/tools/<slug>/index.html`, plus `/bn` twins, sections, sitemap).
   Vercel serves those files directly — no rewrite needed.
2. A SPA fallback rewrite (`/tools/* → /index.html`) would shadow those static
   shells or require ordering hacks per host. The current setup has no conflict:
   crawlers/no-JS readers get the shell; interactive users are handed over via
   `location.replace(/#<path>)` to the same hash route.
3. All canonical / OG / hreflang URLs (`client/src/lib/seo.ts`) already point at
   the clean paths, and `shell-audit.mjs` + `link-audit.mjs` verify shells,
   sitemap agreement, and `#/…` link resolution.

## What this gives us

- Crawlable URLs: `/tools/<slug>/`, `/games/<slug>/`, sections, `/bn/*`.
- Per-tool unique title + description (from `toolDescriptions.ts`), canonical,
  OG/Twitter, `hreflang en/bn/x-default`, JSON-LD (`WebApplication`/`VideoGame` +
  `BreadcrumbList`, no fake ratings).
- In-app `usePageMeta` applies the same tags at runtime for share previews.
- `vercel.json` keeps `no-cache` for `sw.js` / manifest; shells are static files.

## What would be needed to migrate (not planned)

Host rewrite support on every target (Vercel `rewrites`, Pages 404 hack),
shell-vs-SPA conflict resolution, redirect map `#/old → /new`, and full
deep-link/refresh/404 regression. Cost outweighs benefit while shells exist.
