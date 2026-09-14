/** Cobalt Workshop design reminder: the related row is a navigation rail at the foot of the bench—same instrument tray, not an advertisement. */
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { ToolCard } from "@/components/ToolCard";
import { toolRegistry, type Tool } from "@/data/tools";
import { relatedTools } from "@/lib/relatedTools";
import { useTranslation } from "@/contexts/AppSettingsContext";

/**
 * Up to six sibling tools, chosen by `relatedTools`. The heading links to the whole
 * category, so the block works as navigation as well as a suggestion row.
 */
export function RelatedTools({ tool }: { tool: Tool }) {
  const { t } = useTranslation();
  const items = relatedTools(tool.slug, toolRegistry);
  if (items.length === 0) return null;

  return (
    <section className="tool-related" aria-labelledby="tool-related-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("tool.guide.relatedEyebrow")}</p>
          <h2 id="tool-related-title">{t("tool.guide.relatedTitle")}</h2>
        </div>
        <Link href={`/tools?category=${tool.group}`} className="text-link">
          {t("tool.guide.viewCategory")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="tool-grid">
        {items.map((item) => (
          <ToolCard key={item.slug} tool={item} />
        ))}
      </div>
    </section>
  );
}
