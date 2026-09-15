/**
 * Hangman — the first consumer of the engine's `letters` input.
 *
 * Owns only its rules: a curated word, single-letter guesses from physical
 * typing or the on-screen A–Z pad (`text` events either way), six misses,
 * and a staged gallows. Letter input suppresses the `R` restart key by
 * design, so a guess can never also restart the round — the toolbar and the
 * overlay buttons restart instead.
 */
import { useMemo, useState } from "react";
import { GameShell, useGameSession, type ControlSpec, type GameEvent } from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: [], surface: "board", letters: true };

const MAX_MISSES = 6;

/** Common, guessable words — no proper nouns, no hyphens. Pure data. */
export const WORDS = [
  "APPLE", "TIGER", "RIVER", "GUITAR", "PLANET", "OCEAN", "BRIDGE", "CANDLE",
  "HORSE", "BREAD", "CLOUD", "DANCE", "EAGLE", "FOREST", "GRAPE", "HOUSE",
  "JUNGLE", "KITE", "LEMON", "MANGO", "NIGHT", "ONION", "PIANO", "QUEEN",
  "ROBOT", "SNAKE", "TRAIN", "VIOLIN", "WHALE", "CLOCK", "DRUM", "EARTH",
  "FLAME", "GLOBE", "HEART", "CHAIR", "TABLE", "PHONE", "WATER", "LIGHT",
  "STONE", "MOUSE", "MOUNTAIN", "MARKET", "PENCIL", "GARDEN", "WINDOW",
];

export function pickWord(random: () => number = Math.random): string {
  return WORDS[Math.floor(random() * WORDS.length)];
}

type RoundState = { word: string; guessed: string[]; misses: number; over: boolean; won: boolean };

const fresh = (): RoundState => ({ word: pickWord(), guessed: [], misses: 0, over: false, won: false });

export default function Hangman({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const [round, setRound] = useState<RoundState>(fresh);

  const session = useGameSession({
    slug,
    onRestart: () => {
      setRound(fresh());
    },
  });

  const guess = (letter: string) => {
    if (session.phase !== "playing" || round.over || !/^[A-Z]$/.test(letter)) return;
    if (round.guessed.includes(letter)) return;
    const guessed = [...round.guessed, letter];
    if (round.word.includes(letter)) {
      const won = round.word.split("").every((c) => guessed.includes(c));
      if (won) {
        const score = (MAX_MISSES - round.misses) * 100 + round.word.length * 10;
        setRound({ ...round, guessed, over: true, won: true });
        session.commit({ score, level: 1, resources: 1 });
        session.end({ score, level: 1, resources: 1 });
        return;
      }
      setRound({ ...round, guessed });
      session.commit({ score: 0, level: 1, resources: 0 });
      return;
    }
    const misses = round.misses + 1;
    if (misses >= MAX_MISSES) {
      setRound({ ...round, guessed, misses, over: true, won: false });
      session.commit({ score: 0, level: 1, resources: 0 });
      session.end({ score: 0, level: 1, resources: 0 });
      return;
    }
    setRound({ ...round, guessed, misses });
    session.commit({ score: 0, level: 1, resources: 0 });
  };

  const onEvent = (event: GameEvent) => {
    if (event.kind === "text") guess(event.value);
  };

  const wrong = useMemo(() => round.guessed.filter((c) => !round.word.includes(c)), [round.guessed, round.word]);

  const readouts = useMemo(
    () => [
      { labelKey: "game.lives" as const, value: MAX_MISSES - round.misses },
      { labelKey: "game.moves" as const, value: wrong.length },
    ],
    [round.misses, wrong.length],
  );

  const status = round.over ? (round.won ? t("game.over") : `${t("game.over")} — ${round.word}`) : t("game.turnToMove", { mark: `${MAX_MISSES - round.misses}` });

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <div className="game-narrow">
        <p className="game-turn" role="status">{status}</p>
        <Gallows misses={round.misses} />
        <div className="game-hangman-word" aria-label={title}>
          {round.word.split("").map((c, i) => (
            <span key={i}>{round.guessed.includes(c) || round.over ? c : ""}</span>
          ))}
        </div>
        <p className="game-turn" role="status" aria-label={t("game.wrong")}>
          {wrong.join(" ")}
        </p>
      </div>
    </GameShell>
  );
}

/** Seven stages: scaffold plus one part per miss. `currentColor` keeps every theme. */
function Gallows({ misses }: { misses: number }) {
  const parts = [
    <circle key="head" cx="70" cy="28" r="10" />,
    <line key="body" x1="70" y1="38" x2="70" y2="66" />,
    <line key="arm-l" x1="70" y1="46" x2="56" y2="56" />,
    <line key="arm-r" x1="70" y1="46" x2="84" y2="56" />,
    <line key="leg-l" x1="70" y1="66" x2="58" y2="84" />,
    <line key="leg-r" x1="70" y1="66" x2="82" y2="84" />,
  ];
  return (
    <svg width="100" height="92" viewBox="0 0 100 92" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <line x1="10" y1="88" x2="50" y2="88" />
      <line x1="26" y1="88" x2="26" y2="6" />
      <line x1="26" y1="6" x2="70" y2="6" />
      <line x1="70" y1="6" x2="70" y2="18" />
      {parts.slice(0, misses)}
    </svg>
  );
}
