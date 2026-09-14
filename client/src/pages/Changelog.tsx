/** Cobalt Workshop design reminder: the changelog is a dated work log pinned to the same rail as the rest of the bench—cards, not a wall of prose. */
import { useTranslation } from "@/contexts/AppSettingsContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { changelog } from "@/data/changelog";
import { formatSiteDate } from "@/lib/siteUpdated";

export default function Changelog() {
  const { t, language } = useTranslation();
  usePageMeta("changelog.title", "changelog.copy");

  return (
    <div className="site-frame page-space">
      <header className="page-intro">
        <p className="eyebrow">{t("changelog.eyebrow")}</p>
        <h1>{t("changelog.title")}</h1>
        <p>{t("changelog.copy")}</p>
      </header>
      <ol className="changelog-list">
        {changelog.map((entry) => (
          <li key={`${entry.date}-${entry.title.en}`} className="changelog-entry">
            <time className="changelog-date" dateTime={entry.date}>
              {formatSiteDate(entry.date, language)}
            </time>
            <div className="changelog-body">
              <h2>{entry.title[language]}</h2>
              <ul className="changelog-items">
                {entry.items.map((item) => (
                  <li key={item.en}>{item[language]}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
