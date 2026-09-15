/**
 * Sudoku — nine by nine over board navigation plus the engine keypad.
 *
 * Owns only its rules: a shuffled complete grid, symmetric digging, live
 * conflict highlighting, pencil-mark notes, and completion scoring. Digits
 * arrive from the engine 1–9 pad or the hardware; erase clears; the
 * secondary button toggles pencil marks. Validation is by the rules
 * themselves (no duplicate in any row, column, or box), never by comparing
 * against the generated solution — so any valid completion wins, even one
 * the generator did not foresee.
 */
import { useMemo, useState } from "react";
import { GameShell, useBoardNavigation, useGameSession, type ControlSpec, type GameEvent } from "@/games/engine";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: ["erase", "secondary"], surface: "board", keypad: true };

const SIZE = 9;
const CELLS = SIZE * SIZE;
const BOX = 3;
const GIVENS = 36;

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A complete valid grid: base pattern under row, column and digit shuffles. Pure. */
export function solvedGrid(random: () => number = Math.random): number[] {
  const pattern = (r: number, c: number) => (BOX * (r % BOX) + Math.floor(r / BOX) + c) % SIZE;
  const rows = shuffled([0, 1, 2], random).flatMap((band) => shuffled([0, 1, 2], random).map((row) => band * BOX + row));
  const cols = shuffled([0, 1, 2], random).flatMap((band) => shuffled([0, 1, 2], random).map((col) => band * BOX + col));
  const digits = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  const grid: number[] = Array(CELLS).fill(0);
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      grid[r * SIZE + c] = digits[pattern(rows[r], cols[c])];
    }
  }
  return grid;
}

/** Dig symmetric pairs down to GIVENS clues. Pure. */
export function digHoles(solution: number[], random: () => number = Math.random): number[] {
  const givens = solution.slice();
  const order = shuffled(Array.from({ length: Math.floor(CELLS / 2) }, (_, i) => i), random);
  let removed = 0;
  const target = CELLS - GIVENS;
  for (const i of order) {
    if (removed >= target) break;
    const mirror = CELLS - 1 - i;
    if (givens[i] === 0) continue;
    givens[i] = 0;
    removed += 1;
    if (mirror !== i && givens[mirror] !== 0 && removed < target) {
      givens[mirror] = 0;
      removed += 1;
    }
  }
  return givens;
}

/** Indices conflicting with `index`'s value (same value twice in a unit). Pure. */
export function conflicts(values: number[], index: number): number[] {
  const value = values[index];
  if (value === 0) return [];
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  const bad = new Set<number>();
  for (let c = 0; c < SIZE; c += 1) {
    const i = row * SIZE + c;
    if (i !== index && values[i] === value) {
      bad.add(i);
      bad.add(index);
    }
  }
  for (let r = 0; r < SIZE; r += 1) {
    const i = r * SIZE + col;
    if (i !== index && values[i] === value) {
      bad.add(i);
      bad.add(index);
    }
  }
  const boxRow = Math.floor(row / BOX) * BOX;
  const boxCol = Math.floor(col / BOX) * BOX;
  for (let r = 0; r < BOX; r += 1) {
    for (let c = 0; c < BOX; c += 1) {
      const i = (boxRow + r) * SIZE + (boxCol + c);
      if (i !== index && values[i] === value) {
        bad.add(i);
        bad.add(index);
      }
    }
  }
  return Array.from(bad);
}

/** True when every cell is filled and nothing conflicts. Pure. */
export function isComplete(values: number[]): boolean {
  for (let i = 0; i < CELLS; i += 1) {
    if (values[i] === 0 || conflicts(values, i).length > 0) return false;
  }
  return true;
}

type SudokuState = { givens: number[]; values: number[]; notes: string[]; notesMode: boolean; filled: number; over: boolean };

const fresh = (): SudokuState => {
  const solution = solvedGrid();
  const givens = digHoles(solution);
  return {
    givens,
    values: givens.slice(),
    notes: Array(CELLS).fill(""),
    notesMode: false,
    filled: givens.filter((g) => g !== 0).length,
    over: false,
  };
};

export default function Sudoku({ slug, title }: GameModuleProps) {
  const [puzzle, setPuzzle] = useState<SudokuState>(fresh);

  const session = useGameSession({
    slug,
    onRestart: () => {
      setPuzzle(fresh());
    },
  });

  const enterDigit = (cursor: number, digit: string) => {
    if (session.phase !== "playing" || puzzle.over || puzzle.givens[cursor] !== 0) return;
    if (puzzle.notesMode) {
      const notes = puzzle.notes.slice();
      const cell = notes[cursor];
      notes[cursor] = cell.includes(digit) ? cell.split("").filter((d) => d !== digit).sort().join("") : (cell + digit).split("").sort().join("");
      setPuzzle({ ...puzzle, notes });
      return;
    }
    const values = puzzle.values.slice();
    values[cursor] = Number(digit);
    const notes = puzzle.notes.slice();
    notes[cursor] = "";
    const filled = values.filter((v) => v !== 0).length;
    if (isComplete(values)) {
      const next = { ...puzzle, values, notes, filled, over: true };
      setPuzzle(next);
      session.commit({ score: 300, level: 1, resources: filled });
      session.end({ score: 300, level: 1, resources: filled });
      return;
    }
    setPuzzle({ ...puzzle, values, notes, filled });
    session.commit({ score: 0, level: 1, resources: filled });
  };

  const clearCell = (cursor: number) => {
    if (session.phase !== "playing" || puzzle.over || puzzle.givens[cursor] !== 0) return;
    const values = puzzle.values.slice();
    values[cursor] = 0;
    const notes = puzzle.notes.slice();
    notes[cursor] = "";
    setPuzzle({ ...puzzle, values, notes, filled: values.filter((v) => v !== 0).length });
  };

  const nav = useBoardNavigation({ rows: SIZE, cols: SIZE, onActivate: () => undefined });

  const onEvent = (event: GameEvent) => {
    if (event.kind === "text" && /^[1-9]$/.test(event.value)) enterDigit(nav.cursor, event.value);
    else if (event.kind === "action" && event.id === "erase") clearCell(nav.cursor);
    else if (event.kind === "action" && event.id === "secondary") {
      if (session.phase === "playing" && !puzzle.over) setPuzzle({ ...puzzle, notesMode: !puzzle.notesMode });
    }
  };

  const badSet = useMemo(() => {
    const bad = new Set<number>();
    for (let i = 0; i < CELLS; i += 1) {
      if (puzzle.values[i] !== 0) {
        for (const b of conflicts(puzzle.values, i)) bad.add(b);
      }
    }
    return bad;
  }, [puzzle.values]);

  const readouts = useMemo(
    () => [
      { labelKey: "game.moves" as const, value: puzzle.filled },
      // A real count, not a mode glyph: notes mode itself is toggled from the
      // secondary control and announced there; the stat stays a stat.
      { labelKey: "game.notes" as const, value: puzzle.notes.filter((n) => n !== "").length },
    ],
    [puzzle.filled, puzzle.notes],
  );

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <div className="board-stage">
        <div className="game-board-dense" style={{ ["--cols" as string]: SIZE }} aria-label={title}>
          {puzzle.values.map((value, i) => {
            const given = puzzle.givens[i] !== 0;
            const note = !given && value === 0 ? puzzle.notes[i] : "";
            return (
              <button
                key={i}
                type="button"
                className="game-cell"
                data-played={value !== 0}
                data-given={given}
                data-bad={badSet.has(i)}
                aria-disabled={puzzle.over}
                aria-label={value !== 0 ? `${i + 1}, ${value}` : note !== "" ? `${i + 1}, ${note.split("").join(" ")}` : `${i + 1}`}
                {...nav.cellProps(i)}
              >
                {value !== 0 ? value : note !== "" ? <small className="game-notes">{note}</small> : ""}
              </button>
            );
          })}
        </div>
      </div>
    </GameShell>
  );
}
