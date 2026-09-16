/** Cobalt Workshop design reminder: each compact game session is a tactile local cartridge—score, level and progress persist without a leaderboard server. */
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useRoute } from "wouter";
import { findGame, gameRegistry, type Game } from "@/data/games";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { displaySlug, safeSlug } from "@/lib/slug";
import ComingSoon from "@/games/ComingSoon";
import { loadGame } from "@/games/registry";
import NotFound from "@/pages/NotFound";

export default function GamePage() {
  const [, params] = useRoute("/games/:slug");
  const slug = safeSlug(params?.slug);
  const game = findGame(slug);

  if (!game) return <NotFound titleKey="game.missing.title" copyKey="game.missing.copy" backHref="/games" backLabelKey="nav.games" detail={displaySlug(slug) || undefined} />;

  // Keyed on the slug so switching games starts from that game's own saved state.
  // `Switch` reuses the element instead of remounting it when only the param changes.
  return <GameArena key={game.slug} game={game} />;
}

/**
 * The page around the board.
 *
 * This component deliberately owns nothing about play. The header, the exit link and
 * the page title live here; phase, score, persistence, input and the on-screen
 * controls all belong to `GameShell` inside the game module, so every game gets the
 * same keyboard and touch behaviour without this file knowing which game it is.
 */
function GameArena({ game }: { game: Game }) {
  const { t, language } = useTranslation();
  usePageMeta("games.title", "games.copy", game.name);
  const Icon = game.icon;
  const Game = loadGame(game.slug);
  // Same shelf, other cartridges: the genre the player already likes.
  const related = gameRegistry.filter((other) => other.genre === game.genre && other.slug !== game.slug).slice(0, 3);

  return (
    <div className="site-frame page-space">
      <Link href="/games" className="back-link">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("game.exit")}
      </Link>
      <section className="game-arena" aria-labelledby="game-arena-title">
        <div className="game-arena-head">
          <div>
            <p className="eyebrow">{language === "bn" ? game.genreBn : game.genre}</p>
            <h1 id="game-arena-title">{game.name}</h1>
            <p>{game.description[language]}</p>
          </div>
          <span className="game-title-icon" aria-hidden="true">
            <Icon className="size-7" />
          </span>
        </div>
        {Game ? (
          // A game chunk is small and local, but on a cold or slow connection it is
          // still a network wait, so the fallback reserves the board's shape instead of
          // printing one line of text that reads like a caption.
          <Suspense
            fallback={
              <div className="game-loading" role="status" aria-live="polite">
                <span className="sr-only">{t("common.loading")}</span>
                <div className="game-loading-arena" aria-hidden="true" />
                <div className="game-loading-bar" aria-hidden="true" />
                <div className="game-loading-bar game-loading-bar-short" aria-hidden="true" />
              </div>
            }
          >
            <Game slug={game.slug} title={game.name} />
          </Suspense>
        ) : (
          <ComingSoon />
        )}
      </section>
      {related.length > 0 && (
        <section className="tool-related" aria-labelledby="game-related-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("tool.guide.relatedEyebrow")}</p>
              <h2 id="game-related-title">{t("tool.guide.relatedTitle")}</h2>
            </div>
            <Link href="/games" className="text-link">
              {t("home.viewAll")} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="game-grid">
            {related.map((other) => {
              const OtherIcon = other.icon;
              return (
                <Link key={other.slug} href={`/games/${other.slug}`} className="game-card">
                  <div className="game-card-top">
                    <span className="game-icon" aria-hidden="true">
                      <OtherIcon className="size-5" />
                    </span>
                    <span>{language === "bn" ? other.genreBn : other.genre}</span>
                  </div>
                  <div>
                    <h2>{other.name}</h2>
                    <p>{other.description[language]}</p>
                    <span className="game-play-label">
                      {t("games.playableBadge")} <span aria-hidden="true">→</span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
