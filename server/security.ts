/**
 * Self-host security headers, mirroring `vercel.json`.
 *
 * Vercel applies the production headers itself; `pnpm start` serves the same
 * `dist/public` without a CDN in front, so this module applies the identical set
 * through helmet. The two copies must never drift: `scripts/csp-hashes.mjs`
 * asserts the CSP hashes here match `client/public/404.html`, and the directive
 * list below is intentionally written out in the same order as `vercel.json` so a
 * visual diff catches anything else.
 */
import helmet from "helmet";

/** sha256 of the inline `<style>` block in `client/public/404.html`. */
export const CSP_STYLE_404_HASH = "sha256-bpypoTR0KUXHrm1UCbUNNlgfw8WeEcXfhVy7yFGmKgE=";
/** sha256 of the inline `<script>` block in `client/public/404.html`. */
export const CSP_SCRIPT_404_HASH = "sha256-f+5/MSA2CfyLTRHbmbaHbKai9uvW23Q9dP4udbPVwmM=";

/** Mirrors the `Strict-Transport-Security` value in `vercel.json`. */
export const HSTS_VALUE = "max-age=63072000; includeSubDomains";

/** Mirrors the `Permissions-Policy` value in `vercel.json`. */
export const PERMISSIONS_POLICY_VALUE = "camera=(self), microphone=(), geolocation=()";

/** Directive list in `vercel.json` order. */
export const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'wasm-unsafe-eval'", `'${CSP_SCRIPT_404_HASH}'`],
  "style-src": ["'self'", `'${CSP_STYLE_404_HASH}'`],
  "font-src": ["'self'", "data:"],
  "img-src": ["'self'", "data:", "blob:"],
  "connect-src": ["'self'"],
  "worker-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
} as const;

export function securityMiddleware() {
  return helmet({
    contentSecurityPolicy: { directives: CSP_DIRECTIVES },
    // Same value as `vercel.json`; helmet only sends it over HTTPS.
    hsts: { maxAge: 63072000, includeSubDomains: true },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // Load-bearing `false`s, not laxity: COEP `require-corp` would block the
    // `blob:` PDF worker, `data:` fonts and canvas blob URLs this app relies on,
    // and CORP `same-origin` risks the same class. No cross-origin isolation is
    // needed: nothing here uses SharedArrayBuffer.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  });
}
