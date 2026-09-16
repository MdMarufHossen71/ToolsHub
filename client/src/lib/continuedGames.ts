/**
 * Games the visitor has actually played, for the home page's "continue" strip.
 *
 * Saves live under one namespaced key per slug (`gameStateKey`) and only exist
 * once a run writes them — merely opening a game creates nothing — so presence
 * plus a positive score is a played game. Corrupt or ancient saves are skipped
 * by the same validator the games themselves use.
 */
import { gameRegistry, type Game } from "@/data/games";
import { parseGameSave, type GameSave } from "@/hooks/useGamePersistence";
import { gameStateKey, safeGet } from "@/lib/storage";

export type ContinuedGame = { game: Game; save: GameSave };

export function getContinuedGames(limit = 4): ContinuedGame[] {
  if (typeof localStorage === "undefined") return [];
  const played: ContinuedGame[] = [];
  for (const game of gameRegistry) {
    let raw: unknown;
    try {
      raw = safeGet<unknown>(gameStateKey(game.slug), null);
    } catch {
      continue;
    }
    if (raw === null) continue;
    const save = parseGameSave(raw);
    if (!save || (save.highScore <= 0 && save.score <= 0)) continue;
    played.push({ game, save });
  }
  return played
    .sort((a, b) => (a.save.updatedAt < b.save.updatedAt ? 1 : -1))
    .slice(0, Math.max(0, limit));
}
