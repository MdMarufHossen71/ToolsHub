/** Cobalt Workshop design reminder: informational pages are concise field notes, using spacious editorial typography and not marketing language. */
import { Link, useRoute } from "wouter";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { TranslationKey } from "@/i18n/translations";
import { safeSlug } from "@/lib/slug";

const map: Record<string, readonly [TranslationKey, TranslationKey]> = {
  about: ["static.about.title", "static.about.copy"],
  "how-to": ["static.how.title", "static.how.copy"],
  privacy: ["static.privacy.title", "static.privacy.copy"],
};

// The about pair, written out so the lookup below never needs a double fallback.
const FALLBACK: readonly [TranslationKey, TranslationKey] = ["static.about.title", "static.about.copy"];

export default function InfoPage() {
  const [, params] = useRoute("/:slug");
  const { t } = useTranslation();
  const [titleKey, copyKey] = map[safeSlug(params?.slug).toLowerCase()] ?? FALLBACK;
  usePageMeta(titleKey, copyKey);

  return (
    <div className="site-frame page-space">
      <article className="info-sheet">
        <p className="eyebrow">{t("static.eyebrow")}</p>
        <h1>{t(titleKey)}</h1>
        <p>{t(copyKey)}</p>
        <Link href="/tools" className="text-link">
          {t("home.tools")} <span aria-hidden="true">→</span>
        </Link>
      </article>
    </div>
  );
}
