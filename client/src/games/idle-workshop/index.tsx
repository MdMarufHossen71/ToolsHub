/**
 * Idle Workshop — a small clicker tycoon with local persistence.
 *
 * Owns only its numbers: click power, three upgrade tracks with compounding
 * costs, per-second income, and offline earnings capped at two hours. Every
 * control is a native button, so keyboard and touch share one path with no
 * engine input at all. The three persisted numbers carry the whole economy:
 * coins in the score, click power in the level, machines and factories
 * packed into resources — so a returning player resumes exactly, including
 * earnings while away.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { GameShell, useGameInterval, useGameSession, type ControlSpec } from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: [], surface: "board" };

const OFFLINE_CAP_SECONDS = 2 * 60 * 60;

type Track = { base: number; growth: number; income: number };
const TRACKS: Record<"cursor" | "machine" | "factory", Track> = {
  cursor: { base: 15, growth: 1.7, income: 0 },
  machine: { base: 60, growth: 1.8, income: 1 },
  factory: { base: 300, growth: 1.9, income: 6 },
};

/** Next price for the nth owned unit. Pure. */
export function priceOf(track: Track, owned: number): number {
  return Math.floor(track.base * Math.pow(track.growth, owned));
}

type Shop = { coins: number; cursors: number; machines: number; factories: number; bonus: number };

const PACK = 1000;

const fresh = (): Shop => ({ coins: 0, cursors: 0, machines: 0, factories: 0, bonus: 0 });

export default function IdleWorkshop({ slug, title }: GameModuleProps) {
  const { t, language } = useTranslation();
  const [shop, setShop] = useState<Shop>(fresh);
  const welcomed = useRef(false);

  const session = useGameSession({
    slug,
    onRestart: () => {
      setShop(fresh());
    },
  });

  const income = shop.machines * TRACKS.machine.income + shop.factories * TRACKS.factory.income;
  const clickPower = 1 + shop.cursors;

  // Returning players resume exactly: coins, click power and both machine
  // counts are packed into the three persisted numbers, and the shop also
  // collects what it earned while away (capped at two hours so an abandoned
  // tab cannot mint forever). Runs once: the save timestamp moves forward.
  useEffect(() => {
    if (welcomed.current) return;
    welcomed.current = true;
    const save = session.save;
    if (!save) return;
    const cursors = Math.max(0, (save.level ?? 1) - 1);
    const machines = Math.floor((save.resources ?? 0) / PACK);
    const factories = (save.resources ?? 0) % PACK;
    const perSecond = machines * TRACKS.machine.income + factories * TRACKS.factory.income;
    let bonus = 0;
    if (save.updatedAt) {
      const awaySeconds = (Date.now() - Date.parse(save.updatedAt)) / 1000;
      if (Number.isFinite(awaySeconds) && awaySeconds >= 60 && perSecond > 0) {
        bonus = Math.floor(Math.min(awaySeconds, OFFLINE_CAP_SECONDS) * perSecond);
      }
    }
    if (save.score > 0 || cursors > 0 || machines > 0 || factories > 0 || bonus > 0) {
      setShop({ coins: save.score + bonus, cursors, machines, factories, bonus });
    }
    // Mount-only restore: `session` is a stable memo, so this runs once (twice in
    // StrictMode dev, where the `welcomed` guard above absorbs the second pass).
  }, [session]);

  const persist = (next: Shop) => {
    session.commit({
      score: Math.floor(next.coins),
      level: 1 + next.cursors,
      resources: next.machines * PACK + next.factories,
    });
  };

  // Income ticks only while the session runs: pausing genuinely pauses the
  // shop, and there is no interval left behind on unmount.
  useGameInterval(session, 1000, () => {
    setShop((current) => {
      const perSecond = current.machines * TRACKS.machine.income + current.factories * TRACKS.factory.income;
      if (perSecond <= 0 || session.phase !== "playing") return current;
      const next = { ...current, coins: current.coins + perSecond };
      persist(next);
      return next;
    });
  });

  const work = () => {
    if (session.phase !== "playing") return;
    setShop((current) => {
      const next = { ...current, coins: current.coins + clickPower };
      persist(next);
      return next;
    });
  };

  const buy = (kind: "cursor" | "machine" | "factory") => {
    if (session.phase !== "playing") return;
    setShop((current) => {
      const owned = kind === "cursor" ? current.cursors : kind === "machine" ? current.machines : current.factories;
      const price = priceOf(TRACKS[kind], owned);
      if (current.coins < price) return current;
      const next = {
        ...current,
        coins: current.coins - price,
        cursors: current.cursors + (kind === "cursor" ? 1 : 0),
        machines: current.machines + (kind === "machine" ? 1 : 0),
        factories: current.factories + (kind === "factory" ? 1 : 0),
      };
      persist(next);
      return next;
    });
  };

  const names =
    language === "bn"
      ? { cursor: "কার্সর", machine: "মেশিন", factory: "কারখানা", work: "কাজ করুন" }
      : { cursor: "Cursor", machine: "Machine", factory: "Factory", work: "Work" };

  const rows: Array<{ kind: "cursor" | "machine" | "factory"; owned: number; price: number; blurb: string }> = [
    { kind: "cursor", owned: shop.cursors, price: priceOf(TRACKS.cursor, shop.cursors), blurb: "+1" },
    { kind: "machine", owned: shop.machines, price: priceOf(TRACKS.machine, shop.machines), blurb: "+1/s" },
    { kind: "factory", owned: shop.factories, price: priceOf(TRACKS.factory, shop.factories), blurb: "+6/s" },
  ];

  const readouts = useMemo(
    () => [
      { labelKey: "game.coins" as const, value: Math.floor(shop.coins) },
      { labelKey: "game.level" as const, value: 1 + shop.cursors + shop.machines + shop.factories },
    ],
    [shop.coins, shop.cursors, shop.machines, shop.factories],
  );

  // An idle game never ends: the announcement carries the welcome-back bonus
  // instead, once, and the shell stays quiet otherwise.
  const announcement = shop.bonus > 0 ? `+${shop.bonus}` : undefined;

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} announcement={announcement} onEvent={() => undefined}>
      <div className="game-narrow game-narrow-stretch">
        <p className="game-quiz-question" aria-live="off">
          {Math.floor(shop.coins)} {t("game.coins")}
        </p>
        <p className="game-turn">
          {t("game.perClick", { n: clickPower })} · +{income}/s
        </p>
        <div className="game-choice-list">
          <button type="button" className="game-choice" onClick={work}>
            {names.work} (+{clickPower})
          </button>
          {rows.map((row) => (
            <button
              key={row.kind}
              type="button"
              className="game-choice"
              disabled={shop.coins < row.price}
              onClick={() => buy(row.kind)}
            >
              {names[row.kind]} ×{row.owned} — {row.price} ({row.blurb})
            </button>
          ))}
        </div>
      </div>
    </GameShell>
  );
}
