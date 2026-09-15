/** Cobalt Workshop design reminder: asymmetric, editorial workbench staging—an Electric Cobalt action rail against a quiet deep-ink field. */
import { ArrowRight, ChevronRight, Gamepad2, Layers3, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { Link, useLocation } from "wouter";
import { SearchBox } from "@/components/SearchBox";
import { ToolCard } from "@/components/ToolCard";
import { categories, featuredTools } from "@/data/tools";
import { gameRegistry } from "@/data/games";
import { useFavorites } from "@/lib/favorites";
import { getRecentTools } from "@/lib/recent";
import { registerHeroSearch } from "@/lib/searchFocus";
import { toolsSearchHref } from "@/lib/searchNav";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { usePageMeta } from "@/hooks/usePageMeta";

/** Decorative drafting plate. Replaces three hotlinked PNGs; see `.workshop-plate`. */
const plateClass = { hero: "workshop-plate plate-hero", games: "workshop-plate plate-games", ai: "workshop-plate plate-ai" } as const;
function WorkshopPlate({ variant }: { variant: keyof typeof plateClass }) {
  return <div className={plateClass[variant]} aria-hidden="true"><span className="plate-crosshair" /><span className="plate-diamond" /></div>;
}

export default function Home() {
  const { t, language } = useTranslation();
  usePageMeta("home.metaTitle", "home.copy");
  const [, setLocation] = useLocation();
  // The hero field owns its own value, so typing here does not re-render the page below.
  const recent = getRecentTools();
  const favorites = useFavorites();
  // The registry always ships games; the guards below are type-level only and
  // keep two decorative (aria-hidden) cards from crashing if it ever did not.
  const [showcaseA, , showcaseB] = gameRegistry;
  return <div>
    <section className="hero-section" aria-labelledby="home-hero-title"><div className="hero-grid site-frame"><div className="hero-copy"><p className="eyebrow"><span aria-hidden="true">✦ </span>{t("home.eyebrow")}</p><h1 id="home-hero-title"><span>{t("home.titleA")}</span><span>{t("home.titleB")}</span><span className="text-cobalt-light">{t("home.titleC")}</span></h1><p className="hero-description">{t("home.copy")}</p><SearchBox id="hero-search" variant="hero" onSubmit={(value) => setLocation(toolsSearchHref(value))} showShortcut onInputRef={registerHeroSearch} /><div className="mt-8 flex flex-wrap gap-3"><Link href="/tools" className="hero-primary-cta"><Wrench className="size-4" aria-hidden="true" />{t("home.tools")}<ArrowRight className="size-4" aria-hidden="true" /></Link><Link href="/games" className="hero-secondary-cta"><Gamepad2 className="size-4" aria-hidden="true" />{t("home.games")}</Link></div><ul className="hero-stats"><li>{t("home.statTools")}</li><li>{t("home.statGames")}</li><li>{t("home.statFree")}</li><li>{t("home.statPrivacy")}</li></ul></div><div className="hero-visual" aria-hidden="true"><WorkshopPlate variant="hero" /><div className="hero-coordinate c1">{t("home.markWork")}</div><div className="hero-coordinate c2">{t("home.markPlay")}</div></div></div></section>
    <section className="site-frame section-space" aria-labelledby="home-featured-title"><div className="section-heading"><div><p className="eyebrow">{t("home.stepTools")}</p><h2 id="home-featured-title">{t("home.featured")}</h2><p>{t("home.featuredCopy")}</p></div><Link href="/tools" className="text-link">{t("home.viewAll")}<ArrowRight className="size-4" aria-hidden="true" /></Link></div><div className="tool-grid featured-grid">{featuredTools.map((tool) => <ToolCard key={tool.slug} tool={tool} />)}</div></section>
    {recent.length > 0 && <section className="site-frame section-space" aria-labelledby="home-recent-title"><div className="section-heading"><div><h2 id="home-recent-title">{t("home.recent")}</h2><p>{t("home.recentCopy")}</p></div><Link href="/tools" className="text-link">{t("home.viewAll")}<ArrowRight className="size-4" aria-hidden="true" /></Link></div><div className="tool-grid featured-grid">{recent.map((tool) => <ToolCard key={tool.slug} tool={tool} />)}</div></section>}
    {favorites.length > 0 && <section className="site-frame section-space" aria-labelledby="home-favorites-title"><div className="section-heading"><div><h2 id="home-favorites-title">{t("home.favorites")}</h2><p>{t("home.favoritesCopy")}</p></div><Link href="/tools" className="text-link">{t("home.viewAll")}<ArrowRight className="size-4" aria-hidden="true" /></Link></div><div className="tool-grid featured-grid">{favorites.map((tool) => <ToolCard key={tool.slug} tool={tool} />)}</div></section>}
    <section className="category-section" aria-labelledby="home-categories-title"><div className="site-frame section-space"><div className="section-heading"><div><p className="eyebrow">{t("home.stepSelect")}</p><h2 id="home-categories-title">{t("home.categories")}</h2><p>{t("home.categoriesCopy")}</p></div></div><div className="category-trays">{categories.map((category, index) => { const Icon = category.icon; return <Link key={category.id} href={`/tools?category=${category.id}`} className="category-tray"><span className="tray-index" aria-hidden="true">0{index + 1}</span><span className={`tray-icon ${category.tone}`} aria-hidden="true"><Icon className="size-5" /></span><h3>{language === "bn" ? category.bn : category.label}</h3><span>{t("tools.resultCount", { count: category.count })} <ChevronRight className="inline size-3.5" aria-hidden="true" /></span></Link>; })}</div></div></section>
    <section className="games-feature" aria-labelledby="home-games-title"><div className="site-frame games-feature-inner"><div className="games-feature-copy"><p className="eyebrow">{t("home.stepPlay")}</p><h2 id="home-games-title">{t("home.gamesTitle")}</h2><p>{t("home.gamesCopy")}</p><Link href="/games" className="dark-cta"><Gamepad2 className="size-4" aria-hidden="true" />{t("home.games")}<ArrowRight className="size-4" aria-hidden="true" /></Link></div><div className="game-showcase" aria-hidden="true"><WorkshopPlate variant="games" />{showcaseA && showcaseB && <><div className="floating-game-card"><span><Layers3 className="size-4" /></span><strong>{showcaseA.name}</strong><small>{language === "bn" ? showcaseA.genreBn : showcaseA.genre}</small></div><div className="floating-game-card second"><span><Sparkles className="size-4" /></span><strong>{showcaseB.name}</strong><small>{language === "bn" ? showcaseB.genreBn : showcaseB.genre}</small></div></>}</div></div></section>
    <section className="site-frame section-space" aria-labelledby="home-ai-title"><div className="ai-prompt"><div><p className="eyebrow">{t("home.stepAi")}</p><h2 id="home-ai-title">{t("home.aiTitle")}</h2><p>{t("home.aiCopy")}</p></div><div className="ai-prompt-action"><span aria-hidden="true"><ShieldCheck className="size-5" /></span><Link href="/ai" className="text-link">{t("home.viewAi")}<ArrowRight className="size-4" aria-hidden="true" /></Link></div><WorkshopPlate variant="ai" /></div></section>
  </div>;
}
