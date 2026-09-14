/**
 * Progressive-web-app plumbing.
 *
 * The URL maths lives here, away from `main.tsx` and the install banner, so the
 * base-path behaviour can be unit tested without a DOM: the build sets `base: "./"`
 * and the same output may be served from a domain root or a subpath, so a
 * hardcoded `/sw.js` would register the wrong scope (or nothing) on a subpath.
 */
import { safeGet, safeSet, settingsKey } from "@/lib/storage";

/** Where the install banner records that the user said "not now". */
export const INSTALL_DISMISSED_KEY = settingsKey("installPromptDismissed");

/** Absolute URL of the service worker, resolved against the app's own base path. */
export function resolveServiceWorkerUrl(baseUrl: string, href: string): string {
  return new URL("sw.js", new URL(baseUrl, href)).href;
}

/** The directory the worker controls — the app's base path, e.g. `/` or `/subpath/`. */
export function resolveServiceWorkerScope(baseUrl: string, href: string): string {
  return new URL(baseUrl, href).pathname;
}

/**
 * True when the page is already running as an installed app. `display-mode:
 * standalone` covers Android/desktop; iOS sets `navigator.standalone` instead.
 */
export function isStandalone(displayModeMatches: boolean, navigatorStandalone: boolean | undefined): boolean {
  return displayModeMatches || navigatorStandalone === true;
}

/** Reads the persisted dismissal. Anything unreadable reads as "not dismissed". */
export function installPromptDismissed(): boolean {
  return safeGet<boolean>(INSTALL_DISMISSED_KEY, false) === true;
}

/** Persists a dismissal so a reload does not bring the banner back. */
export function dismissInstallPrompt(): void {
  safeSet(INSTALL_DISMISSED_KEY, true);
}

/**
 * Registers the service worker in production only. In dev the worker would serve
 * hashed builds over HMR, so registration is skipped entirely; a failed
 * registration is swallowed because offline support is a bonus, not a dependency.
 * Registration waits for `load` so precaching cannot compete with first paint.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof window === "undefined" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker
      .register(resolveServiceWorkerUrl(import.meta.env.BASE_URL, window.location.href), {
        scope: resolveServiceWorkerScope(import.meta.env.BASE_URL, window.location.href),
      })
      .catch(() => {
        /* The app works without a worker; a failure here must not surface. */
      });
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
