/**
 * Memory Match — flip-two board over `useBoardNavigation`, no canvas.
 *
 * Owns only its rules: a shuffled 4×4 deck of eight pairs, two-up flip
 * discipline with a short peek-back delay, and efficiency scoring. Focus,
 * arrows, taps, pause, persistence and the legend belong to the engine.
 * Faces are emoji — distinct shapes, identical in both languages.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameShell, useBoardNavigation, useGameSession, type ControlSpec } from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: [], surface: "board" };

const FACES = ["🍎", "🚀", "🐱", "🌙", "⚡", "🎈", "🐟", "🌵"];
const PAIRS = FACES.length;
const CELLS = PAIRS * 2;
const PEEK_MS = 750;

/** Shuffled deck: each face exactly twice. Pure. */
export function shuffledDeck(random: () => number = Math.random): string[] {
  const deck = [...FACES, ...FACES];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = deck[i];
    const b = deck[j];
    // Loop-bounded on both sides; the guard is type-level only.
    if (a === undefined || b === undefined) continue;
    deck[i] = b;
    deck[j] = a;
  }
  return deck;
}

type BoardState = {
  deck: string[];
  open: number[];
  matched: boolean[];
  moves: number;
  pairs: number;
  lock: boolean;
  over: boolean;
};

const fresh = (): BoardState => ({
  deck: shuffledDeck(),
  open: [],
  matched: Array(CELLS).fill(false),
  moves: 0,
  pairs: 0,
  lock: false,
  over: false,
});

export default function MemoryMatch({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const [board, setBoard] = useState<BoardState>(fresh);
  // Bumped on every restart so a pending peek-back from the previous round can
  // never flip cards in the new one. Timers also clear on unmount below.
  const generation = useRef(0);
  const timer = useRef(0);

  const session = useGameSession({
    slug,
    onRestart: () => {
      generation.current += 1;
      window.clearTimeout(timer.current);
      setBoard(fresh());
    },
  });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flip = useCallback(
    (index: number) => {
      if (session.phase !== "playing") return;
      const current = board;
      if (current.over || current.lock || current.matched[index] || current.open.includes(index)) return;
      const open = [...current.open, index];
      if (open.length < 2) {
        setBoard({ ...current, open });
        return;
      }
      const moves = current.moves + 1;
      const [a, b] = open;
      // Two cards by the length check above; the guard is type-level only.
      if (a === undefined || b === undefined) return;
      if (current.deck[a] === current.deck[b]) {
        const matched = current.matched.slice();
        matched[a] = true;
        matched[b] = true;
        const pairs = current.pairs + 1;
        const done = pairs === PAIRS;
        // Fewer moves, higher score: a perfect round is 8 moves for 1000.
        const score = done ? Math.max(100, 1200 - moves * 25) : pairs * 50;
        setBoard({ ...current, open: [], matched, moves, pairs, over: done });
        session.commit({ score, level: 1, resources: pairs });
        if (done) session.end({ score, level: 1, resources: pairs });
        return;
      }
      const round = generation.current;
      setBoard({ ...current, open, moves, lock: true });
      session.commit({ score: current.pairs * 50, level: 1, resources: current.pairs });
      timer.current = window.setTimeout(() => {
        if (generation.current !== round) return;
        setBoard((latest) => (latest.lock ? { ...latest, open: [], lock: false } : latest));
      }, PEEK_MS);
    },
    [board, session],
  );

  const nav = useBoardNavigation({ rows: 4, cols: 4, onActivate: flip });

  const readouts = useMemo(
    () => [
      { labelKey: "game.moves" as const, value: board.moves },
      { labelKey: "game.pairs" as const, value: board.pairs },
    ],
    [board.moves, board.pairs],
  );

  const announcement = board.pairs > 0 && !board.over ? `${t("game.pairs")} ${board.pairs}` : undefined;

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} announcement={announcement} onEvent={() => undefined}>
      <div className="game-board" style={{ ["--cols" as string]: 4 }} aria-label={title}>
        {board.deck.map((face, i) => {
          const shown = board.open.includes(i) || board.matched[i];
          return (
            <button
              key={i}
              type="button"
              className="game-cell"
              data-played={shown}
              data-win={board.matched[i]}
              data-face-down={!shown}
              aria-disabled={board.over}
              aria-label={`${i + 1}${shown ? `, ${face}` : ""}`}
              {...nav.cellProps(i)}
              onClick={() => flip(i)}
            >
              {shown ? face : "?"}
            </button>
          );
        })}
      </div>
    </GameShell>
  );
}
