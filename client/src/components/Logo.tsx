/** Cobalt Workshop design reminder: the brand is a drafting-sheet registration mark — a cobalt plate with two paper wedges cut in from the sides — not a letter, so it is drawn once here and recoloured by the active theme rather than by any other component. */
import { useId } from "react";

/**
 * The mark on its own: a rounded cobalt square with two 45°-rotated paper wedges
 * entering from the left and right. The geometry is written in the same 29×29 space
 * the old `.brand-mark` rules painted in, so the SVG is a faithful version of that
 * mark rather than a redraw. Fills come from custom properties, which means the mark
 * repaints with the user's theme, and a viewBox means it stays crisp from a 16px
 * favicon to a 512px install icon.
 *
 * `aria-hidden` is not a prop: every use of this mark is decorative (the wordmark
 * hides its own letters, and the wrapping link carries the accessible name), so there
 * is no case where exposing it to assistive technology would help.
 */
export function LogoMark({ className }: { className?: string }) {
  // A clip path needs a DOM id, and the header and footer render a mark each, so the
  // id has to be unique per instance or every mark would clip against the first one.
  // React's generated id contains punctuation that is awkward inside a `url(#…)`
  // fragment, so only letters, digits and hyphens are kept.
  const clipId = `logo-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return <svg className={["logo-mark", className].filter(Boolean).join(" ")} viewBox="0 0 29 29" aria-hidden="true" focusable="false">
    <defs><clipPath id={clipId}><rect x="0" y="0" width="29" height="29" rx="8" /></clipPath></defs>
    <rect x="0" y="0" width="29" height="29" rx="8" fill="var(--primary)" />
    <g clipPath={`url(#${clipId})`}>
      <path d="M2.5 3.893 13.107 14.5 2.5 25.107 -8.107 14.5Z" fill="var(--surface)" />
      <path d="M25.5 3.893 36.107 14.5 25.5 25.107 14.893 14.5Z" fill="var(--background)" />
    </g>
  </svg>;
}

/**
 * The lockup: the mark plus `TOOLS` / `HUB`, with `HUB` in the cobalt token. This is
 * the single place the brand name is lettered, so the header and footer can no longer
 * drift — the footer used to read "BD" and the header "BANGLADESH", leftovers from the
 * old Tools & Games BD name.
 *
 * The lettering is decoration: the wrapping link carries `a11y.home`, exactly as the
 * old markup did, and the product name stays Latin in both locales so it is
 * searchable. `compact` is the smaller lockup for the footer and other tight rails.
 */
export function Wordmark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return <span className={["brand", compact ? "brand-compact" : "", className].filter(Boolean).join(" ")} aria-hidden="true">
    <LogoMark />
    <span>TOOLS<span className="text-primary">HUB</span></span>
  </span>;
}
