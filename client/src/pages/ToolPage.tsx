/** Cobalt Workshop design reminder: a tool detail page is a direct input-to-output bench, with no promotional interruption. */
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useRoute } from "wouter";
import { ToolWorkspace } from "@/components/ToolWorkspace";
import { ToolGuide } from "@/components/ToolGuide";
import { RelatedTools } from "@/components/RelatedTools";
import { findTool } from "@/data/tools";
import NotFound from "@/pages/NotFound";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { pushRecentTool } from "@/lib/recent";
import { safeSlug, displaySlug } from "@/lib/slug";

export default function ToolPage() {
  const [, params] = useRoute("/tools/:slug");
  const slug = safeSlug(params?.slug);
  const tool = findTool(slug);
  const { t } = useTranslation();
  usePageMeta("tools.title", "tools.copy", tool?.name);

  // Feeds the home page's "recently used" strip. Capped and validated inside.
  useEffect(() => {
    if (tool) pushRecentTool(tool.slug);
  }, [tool]);

  if (!tool) return <NotFound titleKey="tool.missing.title" copyKey="tool.missing.copy" backHref="/tools" backLabelKey="nav.tools" detail={displaySlug(slug) || undefined} />;

  return (
    <div className="site-frame page-space">
      <Link href="/tools" className="back-link">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("common.back")}
      </Link>
      {/* Keyed on the slug: `Switch` reuses the element when only the param changes,
          so without this the previous tool's mode and output would carry over. */}
      <ToolWorkspace key={tool.slug} tool={tool} />
      {/* Both are plain rendered text, so the page's "what is this / how do I start"
          content is present for first-time visitors and crawlers without a click. */}
      <ToolGuide key={`guide-${tool.slug}`} tool={tool} />
      <RelatedTools key={`related-${tool.slug}`} tool={tool} />
    </div>
  );
}
