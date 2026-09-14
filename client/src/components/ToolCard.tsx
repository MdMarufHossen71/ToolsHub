/** Cobalt Workshop design reminder: cards are instrument labels—not generic containers—with a visible category signal and a confident directional affordance. */
import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";
import { getToolIcon, type Tool } from "@/data/tools";
import { useSettings } from "@/contexts/AppSettingsContext";
import { FavoriteButton } from "@/components/FavoriteButton";

/**
 * The star is a sibling of the link, not a child of it: a `<button>` inside an `<a>` is
 * invalid HTML and breaks keyboard and screen-reader behaviour. The outer element stays
 * the single grid child carrying `tool-card`, so the `directory-grid` `:nth-child`
 * rhythm is untouched, while the link fills the card and the star floats over its
 * corner.
 */
export function ToolCard({ tool }: { tool: Tool }) {
  const { language } = useSettings(); const Icon = getToolIcon(tool.group);
  return <div className="tool-card group">
    <Link href={`/tools/${tool.slug}`} className="tool-card-link">
      <div className="tool-card-top flex items-start justify-between gap-3"><span className="tool-icon"><Icon className="size-4" /></span><ArrowUpRight className="size-4 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" /></div>
      <div className="mt-auto"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[.13em] text-muted-foreground">{language === "bn" ? tool.categoryBn : tool.category}</p><h3 className="font-display text-[17px] font-semibold tracking-[-.025em]">{tool.name}</h3><p className="mt-1.5 text-sm leading-5 text-muted-foreground">{tool.description[language]}</p></div>
    </Link>
    <FavoriteButton slug={tool.slug} name={tool.name} className="tool-favorite" />
  </div>;
}
