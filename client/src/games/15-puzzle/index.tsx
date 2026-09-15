/**
 * 15 Puzzle — sliding tiles over `useBoardNavigation`, no canvas.
 *
 * Owns only its rules: a solvable shuffled 4×4 board, orthogonal slides into
 * the blank, a move counter, and efficiency scoring. Shuffling by random
 * swaps would often deal an unsolvable board, so parity is repaired instead.
 */
import { useMemo, useState } from "react";
import { GameShell, useBoardNavigation, useGameSession, type ControlSpec } from "@/games/engine";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: [], surface: "board" };

const SIZE = 4;
const CELLS = SIZE * SIZE;
/** 0 is the blank. */
type Tiles = number[];

export function solvedTiles(): Tiles {
  return Array.from({ length: CELLS }, (_, i) => (i + 1) % CELLS);
}

/** True when every tile sits in order with the blank last. Pure. */
export function isSolved(tiles: Tiles): boolean {
  for (let i = 0; i < CELLS; i += 1) {
    if (tiles[i] !== (i + 1) % CELLS) return false;
  }
  return true;
}

/** Inversions ignoring the blank. Pure. */
export function inversionCount(tiles: Tiles): number {
  const values = tiles.filter((t) => t !== 0);
  let inversions = 0;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const a = values[i];
      const b = values[j];
      // Loop-bounded; the guard is type-level only.
      if (a === undefined || b === undefined) continue;
      if (a > b) inversions += 1;
    }
  }
  return inversions;
}

/**
 * A solvable shuffle. On an even-width board the puzzle is solvable exactly
 * when (inversions + blank row from the bottom) is odd; a single swap of two
 * non-blank tiles flips the parity without touching anything else.
 */
export function solvableShuffle(random: () => number = Math.random): Tiles {
  const tiles = solvedTiles();
  for (let i = tiles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = tiles[i];
    const b = tiles[j];
    if (a === undefined || b === undefined) continue;
    tiles[i] = b;
    tiles[j] = a;
  }
  if (isSolved(tiles)) return solvableShuffle(random);
  const blankRowFromBottom = SIZE - Math.floor(tiles.indexOf(0) / SIZE);
  if ((inversionCount(tiles) + blankRowFromBottom) % 2 === 0) {
    const a = tiles.findIndex((t) => t !== 0);
    const b = tiles.findIndex((t, i) => t !== 0 && i !== a);
    const va = tiles[a];
    const vb = tiles[b];
    if (va !== undefined && vb !== undefined && a >= 0 && b >= 0) {
      tiles[a] = vb;
      tiles[b] = va;
    }
  }
  return tiles;
}

/** Indices orthogonally adjacent to `index`. Pure. */
export function neighbours(index: number): number[] {
  const out: number[] = [];
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  if (row > 0) out.push(index - SIZE);
  if (row < SIZE - 1) out.push(index + SIZE);
  if (col > 0) out.push(index - 1);
  if (col < SIZE - 1) out.push(index + 1);
  return out;
}

type BoardState = { tiles: Tiles; moves: number; over: boolean };

const fresh = (): BoardState => ({ tiles: solvableShuffle(), moves: 0, over: false });

export default function FifteenPuzzle({ slug, title }: GameModuleProps) {
  const [board, setBoard] = useState<BoardState>(fresh);

  const session = useGameSession({
    slug,
    onRestart: () => {
      setBoard(fresh());
    },
  });

  const slide = (index: number) => {
    if (session.phase !== "playing" || board.over || board.tiles[index] === 0) return;
    const blank = board.tiles.indexOf(0);
    if (!neighbours(blank).includes(index)) return;
    const tiles = board.tiles.slice();
    const moving = tiles[index];
    const empty = tiles[blank];
    if (moving === undefined || empty === undefined) return;
    tiles[blank] = moving;
    tiles[index] = empty;
    const moves = board.moves + 1;
    if (isSolved(tiles)) {
      const score = Math.max(100, 3000 - moves * 10);
      setBoard({ tiles, moves, over: true });
      session.commit({ score, level: 1, resources: moves });
      session.end({ score, level: 1, resources: moves });
      return;
    }
    setBoard({ tiles, moves, over: false });
    session.commit({ score: 0, level: 1, resources: moves });
  };

  const nav = useBoardNavigation({ rows: SIZE, cols: SIZE, onActivate: slide });

  const blank = board.tiles.indexOf(0);
  const adjacent = useMemo(() => new Set(neighbours(blank)), [blank]);

  const readouts = useMemo(() => [{ labelKey: "game.moves" as const, value: board.moves }], [board.moves]);

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={() => undefined}>
      <div className="game-board" style={{ ["--cols" as string]: SIZE }} aria-label={title}>
        {board.tiles.map((tile, i) => (
          <button
            key={i}
            type="button"
            className="game-cell"
            data-played={tile !== 0}
            data-blank={tile === 0}
            aria-disabled={board.over || tile === 0 || !adjacent.has(i)}
            aria-label={tile === 0 ? `${i + 1}` : `${i + 1}, ${tile}`}
            {...nav.cellProps(i)}
            onClick={() => slide(i)}
          >
            {tile === 0 ? "" : tile}
          </button>
        ))}
      </div>
    </GameShell>
  );
}
