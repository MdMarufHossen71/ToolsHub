/**
 * The site's "last updated" date and its per-locale formatting.
 *
 * This lives apart from `data/changelog.ts` on purpose. The site shell renders the
 * date on every page, while the changelog entry list is only needed by the changelog
 * page; when both came from one module, the bundler anchored that module in the entry
 * chunk and dragged the whole bilingual history into first paint. Keeping the date and
 * the formatter here means the shell imports a few hundred bytes, not the entries.
 *
 * `changelog.test.ts` pins `SITE_LAST_UPDATED` to the first entry's date, so it cannot
 * drift when an entry is added.
 */
export const SITE_LAST_UPDATED = "2026-09-12";

/**
 * Formats an ISO date for a locale. `bn-BD` gives Bangla month names and digits, which
 * is what a Bangla reader expects to see next to the English date on the same page.
 */
export function formatSiteDate(iso: string, language: "en" | "bn"): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat(language === "bn" ? "bn-BD" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
