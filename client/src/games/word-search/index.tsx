/**
 * Word Search — trace hidden words by finger-drag or by keyboard anchor.
 *
 * Owns only its content and rules: an 8×8 letter grid with six animal words
 * hidden in any of eight directions, straight-line selection, and
 * either-direction matching. Touch and mouse drag a path across the board
 * (`point` events); the keyboard plants an anchor with Enter/Space, extends
 * it with the arrows, and submits with a second press. No engine change —
 * the anchor is game-side state on top of `useBoardNavigation`.
 */
import { useMemo, useRef, useState } from "react";
import { GameShell, useBoardNavigation, useGameSession, type ControlSpec, type GameEvent } from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: [], surface: "board", pointer: "drag" };

const SIZE = 8;
const CELLS = SIZE * SIZE;

const CANDIDATES = ["TIGER", "SNAKE", "WHALE", "EAGLE", "HORSE", "ZEBRA", "PANDA", "KOALA", "MONKEY", "GIRAFFE"];
const WORD_COUNT = 6;

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export type Placement = { word: string; cells: number[] };

/** Cells on the constrained straight line from `a` to `b`, inclusive. Pure. */
export function lineCells(a: number, b: number): number[] {
  const r0 = Math.floor(a / SIZE);
  const c0 = a % SIZE;
  const r1 = Math.floor(b / SIZE);
  const c1 = b % SIZE;
  let dr = r1 - r0;
  let dc = c1 - c0;
  if (dr === 0 && dc === 0) return [a];
  // Constrain to the eight compass lines: drop the weaker axis.
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) {
    if (Math.abs(dr) > Math.abs(dc)) dc = 0;
    else dr = 0;
  }
  const stepR = Math.sign(dr);
  const stepC = Math.sign(dc);
  const length = Math.max(Math.abs(dr), Math.abs(dc));
  const out: number[] = [];
  for (let i = 0; i <= length; i += 1) {
    const r = r0 + stepR * i;
    const c = c0 + stepC * i;
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) break;
    out.push(r * SIZE + c);
  }
  return out;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Grid, placements, and filler letters. Retries until every word fits. Pure. */
export function buildPuzzle(random: () => number = Math.random): { grid: string[]; placements: Placement[] } {
  const words = shuffle(CANDIDATES, random).slice(0, WORD_COUNT);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const grid: (string | null)[] = Array(CELLS).fill(null);
    const placements: Placement[] = [];
    let ok = true;
    for (const word of shuffle(words, random)) {
      let placed = false;
      for (let trial = 0; trial < 120 && !placed; trial += 1) {
        const [dx, dy] = DIRECTIONS[Math.floor(random() * DIRECTIONS.length)];
        const r0 = Math.floor(random() * SIZE);
        const c0 = Math.floor(random() * SIZE);
        const cells: number[] = [];
        let fits = true;
        for (let i = 0; i < word.length; i += 1) {
          const r = r0 + dy * i;
          const c = c0 + dx * i;
          if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) {
            fits = false;
            break;
          }
          const existing = grid[r * SIZE + c];
          if (existing !== null && existing !== word[i]) {
            fits = false;
            break;
          }
          cells.push(r * SIZE + c);
        }
        if (fits) {
          cells.forEach((cell, i) => {
            grid[cell] = word[i];
          });
          placements.push({ word, cells });
          placed = true;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      return {
        grid: grid.map((g) => g ?? letters[Math.floor(random() * letters.length)]),
        placements,
      };
    }
  }
  // Practically unreachable (200 full retries), but a half-built board must
  // never ship: fall back to a trivially verifiable puzzle instead of nothing.
  const grid = Array(CELLS).fill("A");
  return { grid, placements: [] };
}

type SearchState = {
  grid: string[];
  placements: Placement[];
  found: string[];
  attempts: number;
  lastFound: string;
  over: boolean;
};

const fresh = (): SearchState => {
  const { grid, placements } = buildPuzzle();
  return { grid, placements, found: [], attempts: 0, lastFound: "", over: false };
};

export default function WordSearch({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const [puzzle, setPuzzle] = useState<SearchState>(fresh);
  const [selection, setSelection] = useState<number[]>([]);
  const anchor = useRef<number | null>(null);
  const dragging = useRef(false);
  // Mirror of the drag path for the release handler: reading it avoids a side
  // effect inside a setState updater, which React may invoke more than once.
  const selectionRef = useRef<number[]>([]);
  const setPath = (path: number[]) => {
    selectionRef.current = path;
    setSelection(path);
  };

  const session = useGameSession({
    slug,
    onRestart: () => {
      anchor.current = null;
      dragging.current = false;
      selectionRef.current = [];
      setSelection([]);
      setPuzzle(fresh());
    },
  });

  /** Scores a finished path. Shared by the drag release and the anchor press. */
  const submitPath = (path: number[]) => {
    setPath([]);
    if (session.phase !== "playing" || puzzle.over || path.length < 2) {
      return;
    }
    const letters = path.map((i) => puzzle.grid[i]).join("");
    const reversed = path
      .slice()
      .reverse()
      .map((i) => puzzle.grid[i])
      .join("");
    const hit = puzzle.placements.find((p) => !puzzle.found.includes(p.word) && (p.word === letters || p.word === reversed));
    const attempts = puzzle.attempts + 1;
    if (hit) {
      const found = [...puzzle.found, hit.word];
      const done = found.length === puzzle.placements.length;
      const score = found.length * 100;
      setPuzzle({ ...puzzle, found, attempts, lastFound: hit.word, over: done });
      session.commit({ score, level: 1, resources: found.length });
      if (done) session.end({ score, level: 1, resources: found.length });
    } else {
      setPuzzle({ ...puzzle, attempts, lastFound: "" });
      session.commit({ score: puzzle.found.length * 100, level: 1, resources: puzzle.found.length });
    }
  };

  // Keyboard: first press plants the anchor, cursor moves extend the preview,
  // second press submits the line. The arrows themselves belong to navigation.
  const activate = (index: number) => {
    if (session.phase !== "playing" || puzzle.over) return;
    if (anchor.current === null) {
      anchor.current = index;
      setPath([index]);
      return;
    }
    const path = lineCells(anchor.current, index);
    anchor.current = null;
    submitPath(path);
  };

  const nav = useBoardNavigation({ rows: SIZE, cols: SIZE, onActivate: activate });

  const onEvent = (event: GameEvent) => {
    if (event.kind !== "point" || session.phase !== "playing" || puzzle.over) return;
    const col = Math.min(SIZE - 1, Math.max(0, Math.floor(event.x * SIZE)));
    const row = Math.min(SIZE - 1, Math.max(0, Math.floor(event.y * SIZE)));
    const index = row * SIZE + col;
    if (event.phase === "start") {
      dragging.current = true;
      anchor.current = null;
      setPath([index]);
    } else if (event.phase === "move" && dragging.current) {
      const start = selectionRef.current[0];
      if (start === undefined) return;
      const path = lineCells(start, index);
      const current = selectionRef.current;
      if (path.length !== current.length || path.some((c, i) => c !== current[i])) setPath(path);
    } else if ((event.phase === "end" || event.phase === "cancel") && dragging.current) {
      dragging.current = false;
      submitPath(selectionRef.current);
    }
  };

  const foundSet = useMemo(() => {
    const cells = new Set<number>();
    for (const p of puzzle.placements) {
      if (puzzle.found.includes(p.word)) p.cells.forEach((c) => cells.add(c));
    }
    return cells;
  }, [puzzle.placements, puzzle.found]);

  const selectionSet = useMemo(() => new Set(selection), [selection]);

  const readouts = useMemo(
    () => [
      { labelKey: "game.words" as const, value: puzzle.found.length },
      { labelKey: "game.moves" as const, value: puzzle.attempts },
    ],
    [puzzle.found.length, puzzle.attempts],
  );

  const announcement = puzzle.lastFound !== "" && !puzzle.over ? `${t("game.correct")} — ${puzzle.lastFound}` : undefined;

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} announcement={announcement} onEvent={onEvent}>
      <div className="game-narrow">
        <ul className="game-found-list" aria-label={t("game.words")}>
          {puzzle.placements.map((p) => (
            <li key={p.word} data-found={puzzle.found.includes(p.word)}>
              {p.word}
            </li>
          ))}
        </ul>
        <div className="game-board-dense" style={{ ["--cols" as string]: SIZE }} aria-label={title}>
          {puzzle.grid.map((letter, i) => (
            <button
              key={i}
              type="button"
              className="game-cell"
              data-played={selectionSet.has(i)}
              data-win={foundSet.has(i)}
              aria-disabled={puzzle.over}
              aria-label={`${i + 1}, ${letter}`}
              {...nav.cellProps(i)}
              onClick={() => activate(i)}
            >
              {letter}
            </button>
          ))}
        </div>
      </div>
    </GameShell>
  );
}
