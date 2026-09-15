/**
 * 2048 — slide the whole board, merge equal tiles, keep going until nothing moves.
 *
 * The rules here are the whole of what this file owns. Focus, key capture, the
 * `preventDefault` scope, `touch-action`, the on-screen d-pad, the printed key
 * legend, pause, the tab-hidden auto-pause, the high score and the canvas backing
 * store all belong to `GameShell` and the engine hooks, exactly as in Snake.
 *
 * Two decisions worth stating because they are easy to get wrong:
 *
 *  - A tile is identified by its number, drawn as a numeral. The fill shade rises
 *    with the exponent as a second signal, never as the only one, so the board is
 *    readable in a monochrome theme or by someone who cannot separate the shades.
 *  - The board only repaints when something changed or a pop is still running. A
 *    turn-based board has no reason to burn sixty frames a second redrawing an
 *    identical grid.
 */
import { useCallback, useMemo, useRef } from "react";
import {
  GameShell,
  useGameCanvas,
  useGameLoop,
  useGamePalette,
  useGameSession,
  withAlpha,
  type CanvasSize,
  type ControlSpec,
  type GameEvent,
} from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

/** Cells per side. Four is the game; anything else is a different game. */
const SIZE = 4;
const CELLS = SIZE * SIZE;

/** How long a freshly spawned or merged tile spends growing, in seconds. Decorative. */
const POP_SECONDS = 0.16;

type Direction = "up" | "down" | "left" | "right";

/**
 * Directions only. 2048 has no action button, so declaring `primary` would print a
 * key in the legend and draw a touch button that does nothing.
 *
 * `swipe` is on as well as the d-pad, not instead of it: a flick is the gesture
 * everyone already knows for this game, but a visible control still has to exist.
 */
const SPEC: ControlSpec = {
  actions: ["up", "down", "left", "right"],
  surface: "canvas",
  dpad: "four",
  swipe: true,
  pointer: "none",
};

type Board = {
  /** Tile values by index, row-major. Zero is an empty cell. */
  grid: number[];
  /** Seconds left on each cell's pop, parallel to `grid`. */
  pop: number[];
  score: number;
  moves: number;
  /** Exponent of the largest tile ever reached this run: 1 is a 2, 11 is a 2048. */
  best: number;
};

const emptyGrid = () => new Array<number>(CELLS).fill(0);

/** Adds a 2 (nine times in ten) or a 4 to a random free cell. Returns its index, or −1. */
function spawnTile(board: Board): number {
  const free: number[] = [];
  for (let index = 0; index < CELLS; index += 1) {
    if (board.grid[index] === 0) free.push(index);
  }
  if (free.length === 0) return -1;
  const index = free[Math.floor(Math.random() * free.length)];
  // Non-empty by the check above; the guard is type-level only.
  if (index === undefined) return -1;
  board.grid[index] = Math.random() < 0.9 ? 2 : 4;
  board.pop[index] = POP_SECONDS;
  return index;
}

const startState = (): Board => {
  const board: Board = { grid: emptyGrid(), pop: new Array<number>(CELLS).fill(0), score: 0, moves: 0, best: 1 };
  spawnTile(board);
  spawnTile(board);
  return board;
};

/**
 * The indices of one line, ordered so that index 0 is the cell tiles slide *towards*.
 * Reversing the order is the whole difference between left and right, which is why
 * there is one slide routine rather than four.
 */
function lineIndices(direction: Direction, line: number): number[] {
  const indices: number[] = [];
  for (let step = 0; step < SIZE; step += 1) {
    if (direction === "left") indices.push(line * SIZE + step);
    else if (direction === "right") indices.push(line * SIZE + (SIZE - 1 - step));
    else if (direction === "up") indices.push(step * SIZE + line);
    else indices.push((SIZE - 1 - step) * SIZE + line);
  }
  return indices;
}

type SlideResult = { values: number[]; merged: boolean[]; gained: number };

/** Compacts one line towards index 0, merging each pair at most once. */
function slide(values: number[]): SlideResult {
  const packed = values.filter((value) => value !== 0);
  const out: number[] = [];
  const merged: boolean[] = [];
  let gained = 0;
  for (let index = 0; index < packed.length; index += 1) {
    // A tile that has just absorbed another cannot absorb again on the same move,
    // which is why the second tile is consumed here rather than left for the next
    // iteration to look at.
    if (index + 1 < packed.length && packed[index] === packed[index + 1]) {
      const value = (packed[index] ?? 0) * 2;
      out.push(value);
      merged.push(true);
      gained += value;
      index += 1;
    } else {
      out.push(packed[index] ?? 0);
      merged.push(false);
    }
  }
  while (out.length < SIZE) {
    out.push(0);
    merged.push(false);
  }
  return { values: out, merged, gained };
}

/** Applies a move in place. Returns false when nothing on the board could move. */
function applyMove(board: Board, direction: Direction): boolean {
  let changed = false;
  for (let line = 0; line < SIZE; line += 1) {
    const indices = lineIndices(direction, line);
    const before = indices.map((index) => board.grid[index] ?? 0);
    const result = slide(before);
    for (let step = 0; step < SIZE; step += 1) {
      const index = indices[step];
      const value = result.values[step];
      const merged = result.merged[step];
      // All three arrays hold exactly SIZE entries; the guard is type-level only.
      if (index === undefined || value === undefined || merged === undefined) continue;
      if (board.grid[index] !== value) changed = true;
      board.grid[index] = value;
      if (merged) board.pop[index] = POP_SECONDS;
    }
    board.score += result.gained;
  }
  return changed;
}

/** True while at least one direction would still change something. */
function hasMove(board: Board): boolean {
  for (let index = 0; index < CELLS; index += 1) {
    if (board.grid[index] === 0) return true;
    const row = Math.floor(index / SIZE);
    const column = index % SIZE;
    if (column + 1 < SIZE && board.grid[index] === board.grid[index + 1]) return true;
    if (row + 1 < SIZE && board.grid[index] === board.grid[index + SIZE]) return true;
  }
  return false;
}

/** Exponent of a tile value: 2 → 1, 2048 → 11. Zero for an empty cell. */
const exponentOf = (value: number) => (value > 0 ? Math.round(Math.log2(value)) : 0);

export default function Game2048({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const palette = useGamePalette();
  const state = useRef<Board>(startState());
  /** Set whenever the grid changed, so an unchanged board is not repainted. */
  const dirty = useRef(true);

  const session = useGameSession({
    slug,
    onRestart: () => {
      state.current = startState();
      dirty.current = true;
    },
  });

  const { reducedMotion } = session;

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const current = state.current;
      const board = Math.min(size.width, size.height);
      const offsetX = (size.width - board) / 2;
      const offsetY = (size.height - board) / 2;
      const gap = Math.max(3, board * 0.018);
      const cell = (board - gap * (SIZE + 1)) / SIZE;

      context.clearRect(0, 0, size.width, size.height);
      context.fillStyle = palette.sunken;
      context.fillRect(offsetX, offsetY, board, board);
      context.strokeStyle = palette.borderStrong;
      context.lineWidth = 1;
      context.strokeRect(offsetX + 0.5, offsetY + 0.5, board - 1, board - 1);

      context.textAlign = "center";
      context.textBaseline = "middle";

      for (let index = 0; index < CELLS; index += 1) {
        const row = Math.floor(index / SIZE);
        const column = index % SIZE;
        const x = offsetX + gap + column * (cell + gap);
        const y = offsetY + gap + row * (cell + gap);
        const value = current.grid[index] ?? 0;

        // Every slot is drawn, empty or not, so the grid stays legible as a grid and a
        // player can see where a tile can still go.
        context.fillStyle = withAlpha(palette.border, 0.4);
        context.fillRect(x, y, cell, cell);
        if (value === 0) continue;

        const exponent = exponentOf(value);
        // Growth on spawn and on merge, and nothing else. Skipped outright when the
        // player has asked for reduced motion: the tile simply appears at full size.
        const pop = current.pop[index] ?? 0;
        const popping = !reducedMotion && pop > 0;
        const grow = popping ? 0.82 + 0.18 * (1 - pop / POP_SECONDS) : 1;
        const drawn = cell * grow;
        const inset = (cell - drawn) / 2;

        // The shade rises with the exponent, and the numeral says which tile it is.
        // The shade is the redundant signal, never the only one.
        const base = exponent >= 11 ? palette.accent : palette.primary;
        context.fillStyle = withAlpha(base, Math.min(0.92, 0.16 + exponent * 0.07));
        context.fillRect(x + inset, y + inset, drawn, drawn);
        context.strokeStyle = withAlpha(base, 0.9);
        context.lineWidth = Math.max(1, cell * 0.03);
        context.strokeRect(x + inset, y + inset, drawn, drawn);

        const digits = String(value).length;
        context.fillStyle = exponent >= 6 ? palette.onPrimary : palette.text;
        context.font = `600 ${Math.floor(drawn / (digits <= 2 ? 2.3 : digits === 3 ? 2.9 : 3.6))}px system-ui, sans-serif`;
        context.fillText(String(value), x + cell / 2, y + cell / 2);
      }
    },
    [palette, reducedMotion],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: 1, maxHeight: 560, draw, repaintKey: session.repaintKey });

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      let animating = false;
      for (let index = 0; index < CELLS; index += 1) {
        const remaining = current.pop[index] ?? 0;
        if (remaining > 0) {
          current.pop[index] = Math.max(0, remaining - dt);
          animating = true;
        }
      }
      if (!dirty.current && !animating) return;
      dirty.current = false;
      redraw();
    },
    { hz: 60 },
  );

  const onEvent = useCallback(
    (event: GameEvent) => {
      const id = event.kind === "action" ? event.id : event.kind === "swipe" ? event.id : null;
      if (id !== "up" && id !== "down" && id !== "left" && id !== "right") return;

      const current = state.current;
      if (!applyMove(current, id)) return;

      current.moves += 1;
      spawnTile(current);
      let largest = current.best;
      for (let index = 0; index < CELLS; index += 1) {
        largest = Math.max(largest, exponentOf(current.grid[index] ?? 0));
      }
      current.best = largest;
      dirty.current = true;

      const values = { score: current.score, level: largest, resources: current.moves };
      if (hasMove(current)) session.commit(values);
      else session.end(values);
    },
    [session],
  );

  const highest = 2 ** Math.max(1, session.run.level ?? 1);

  const readouts = useMemo(
    () => [
      { labelKey: "game.tile" as const, value: highest },
      { labelKey: "game.moves" as const, value: session.run.resources ?? 0 },
    ],
    [highest, session.run.resources],
  );

  // Announced when a new largest tile is reached, and at no other time. Reading the
  // score out after every slide would talk over a screen-reader user all game.
  const announcement = highest > 2 ? `${t("game.tile")} ${highest}` : undefined;

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} announcement={announcement} onEvent={onEvent}>
      <canvas ref={canvasRef} className="game-canvas" />
    </GameShell>
  );
}
