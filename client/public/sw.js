/*
 * ToolsHub service worker.
 *
 * This file is served from `client/public/sw.js`, so it lands at the site root of
 * `dist/public` and its scope covers the app. The two placeholder tokens below are
 * replaced at build time by `vitePluginPwaPrecache` in `vite.config.ts` with the
 * real hashed app-shell list and a version derived from that list. Nothing here
 * makes a network request the page would not already make: the app promise is that
 * everything runs on the device, and the worker only caches what the browser
 * requested anyway. Fonts are self-hosted via Fontsource and bundled with the
 * app CSS, so they ride the same-origin cache-first path — no third-party origin.
 *
 * Strategy:
 *   - navigations: network first, so a deploy is picked up on the next visit, with
 *     the precached shell as the offline fallback;
 *   - same-origin GETs: cache first (hashed assets are immutable, and the shell,
 *     manifest and icons are precached), network fallback that fills the cache;
 *   - anything else, including every non-GET request, is left to the browser.
 */

const VERSION = "__BUILD_VERSION__";
const PRECACHE = ["__PRECACHE__"];

const SHELL_CACHE = `toolshub-shell-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // One add per entry on purpose: `cache.addAll` is atomic, so a single 404
      // would abort the whole installation and leave the app with no worker.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            // A single missing shell file must not take the install down.
          }
        }),
      );
      // Activate the new worker immediately; the page can also ask for this via
      // `postMessage("SKIP_WAITING")`.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // An old worker must never be able to serve a stale bundle forever, so every
      // cache this app owns that is not part of the current version is dropped.
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => (name.startsWith("toolshub-") && !CURRENT_CACHES.includes(name) ? caches.delete(name) : undefined)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Nothing non-GET is intercepted, so form posts, range requests and the like keep
  // their normal behaviour.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigations: network first so an update is seen, cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
        }
      })(),
    );
    return;
  }

  // Same-origin static output: cache first, network fills the cache on first use.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }
});
