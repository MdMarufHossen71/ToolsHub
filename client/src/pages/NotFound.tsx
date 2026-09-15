/** Cobalt Workshop design reminder: a dead end still looks like the same workshop — tokens only, no one-off palette. */
import { ArrowLeft, Compass, Home } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import type { TranslationKey } from "@/i18n/translations";

type NotFoundProps = {
  /** Overrides for the inline "unknown slug" case, e.g. an unavailable tool. */
  titleKey?: TranslationKey;
  copyKey?: TranslationKey;
  /** Where the secondary action goes back to. Defaults to the tools directory. */
  backHref?: string;
  backLabelKey?: TranslationKey;
  /** The raw slug that failed to resolve, shown so the user can see the typo. */
  detail?: string | undefined;
};

export default function NotFound({ titleKey = "static.notFound.title", copyKey = "static.notFound.copy", backHref = "/tools", backLabelKey = "nav.tools", detail }: NotFoundProps) {
  const { t } = useTranslation();
  usePageMeta(titleKey, copyKey);

  return (
    <div className="site-frame page-space">
      <section className="not-found-panel" role="region" aria-labelledby="not-found-title">
        <span className="not-found-mark" aria-hidden="true">
          <Compass className="size-7" />
        </span>
        <p className="eyebrow">{t("notFound.code")}</p>
        <h1 id="not-found-title">{t(titleKey)}</h1>
        <p className="not-found-copy">{t(copyKey)}</p>
        {detail && <p className="not-found-detail"><code>{detail}</code></p>}
        <div className="not-found-actions">
          <Button asChild>
            <Link href="/">
              <Home className="mr-2 size-4" />
              {t("notFound.home")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={backHref}>
              <ArrowLeft className="mr-2 size-4" />
              {t(backLabelKey)}
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
