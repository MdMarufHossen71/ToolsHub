/** Cobalt Workshop design reminder: game selection is playful but never noisy—each card feels like a game cartridge waiting on a workshop shelf. */
import { useMemo, useState } from "react";
import { Gamepad2, Search, X } from "lucide-react";
import { Link } from "wouter";
import { gameGenres, gameRegistry } from "@/data/games";
import { isPlayable } from "@/games/registry";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { usePageMeta } from "@/hooks/usePageMeta";

export default function Games() {
  const { t, language } = useTranslation();
  usePageMeta("games.title", "games.copy");
  const [genre, setGenre] = useState("all");
  const [queryRaw, setQueryRaw] = useState("");
  const games = useMemo(() => {
    const query = queryRaw.trim().toLowerCase();
    return gameRegistry.filter(
      (game) =>
        (genre === "all" || game.genre === genre) &&
        (!query ||
          `${game.name} ${game.genre} ${game.genreBn} ${game.description.en} ${game.description.bn}`.toLowerCase().includes(query)),
    );
  }, [genre, queryRaw]);
  const genreLabel = (item: string) => (language === "bn" ? (gameRegistry.find((game) => game.genre === item)?.genreBn ?? item) : item);

  return <div className="site-frame page-space">
    <div className="page-intro"><p className="eyebrow">{t("games.eyebrow")}</p><h1>{t("games.title")}</h1><p>{t("games.copy")}</p></div>
    <div className="directory-bar">
      {/* The input had no label of any kind; the icon beside it is decorative. */}
      <div className="search-field"><Search className="size-4" aria-hidden="true" /><label className="sr-only" htmlFor="games-search">{t("search.aria")}</label><input id="games-search" type="search" value={queryRaw} onChange={(event) => setQueryRaw(event.target.value)} placeholder={t("search.placeholder")} />{queryRaw && <button type="button" className="search-clear" onClick={() => setQueryRaw("")} aria-label={t("common.clearSearch")}><X className="size-3.5" aria-hidden="true" /></button>}</div>
      {/* The count is the only feedback that a filter did anything, so it announces. */}
      <p className="directory-count" role="status"><Gamepad2 className="size-4" aria-hidden="true" />{t("games.count", { count: games.length })}</p>
    </div>
    <div className="filter-rail" role="group" aria-label={t("games.filterLabel")}>
      <button type="button" className={genre === "all" ? "filter-chip active" : "filter-chip"} aria-pressed={genre === "all"} onClick={() => setGenre("all")}>{t("games.all")}</button>
      {gameGenres.map((item) => <button key={item} type="button" className={genre === item ? "filter-chip active" : "filter-chip"} aria-pressed={genre === item} onClick={() => setGenre(item)}>{genreLabel(item)}</button>)}
    </div>
    {games.length ? <div className="game-grid">{games.map((game, index) => {
      const Icon = game.icon;
      // The call to action tells the truth about each card. A game that is not finished
      // says so here instead of promising "Play now" and landing on a coming-soon page.
      const playable = isPlayable(game.slug);
      // The genre is repeated as text inside the card, so colour is never the only
      // thing distinguishing one category of game from another.
      return <Link key={game.slug} href={`/games/${game.slug}`} className={`game-card game-card-${index % 5}${game.featured ? " game-card-featured" : ""}`}><div className="game-card-top"><span className="game-icon" aria-hidden="true"><Icon className="size-5" /></span><span>{language === "bn" ? game.genreBn : game.genre}</span></div><div><h2>{game.name}</h2><p>{game.description[language]}</p>{playable ? <span className="game-play-label">{t("games.playableBadge")} <span aria-hidden="true">→</span></span> : <span className="game-play-label game-play-label-soon">{t("game.comingSoon.badge")}</span>}</div></Link>;
    })}</div> : <p className="empty-state" role="status">{t("games.empty")}</p>}
  </div>;
}
