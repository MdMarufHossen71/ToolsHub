/**
 * Maze Runner — escape a generated maze, or ask the solver to trace the way.
 *
 * Owns only its rules: a recursive-backtracker maze, wall-checked steps, a
 * BFS shortest path on demand, and efficiency scoring. Movement is discrete
 * d-pad/swipe steps; the two extra buttons (trace the solution, deal a new
 * maze) are plain buttons beside the board, reachable by Tab on desktop and
 * by tap on touch.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  GameShell,
  useGameCanvas,
  useGamePalette,
  useGameSession,
  withAlpha,
  type CanvasSize,
  type ControlSpec,
  type GameEvent,
} from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: ["up", "down", "left", "right"], surface: "canvas", dpad: "four", swipe: true };

const SIZE = 15;
const GOAL = { x: SIZE - 1, y: SIZE - 1 };

/** Walls per cell as [north, east, south, west]. Bit 0=N, 1=E, 2=S, 3=W. */
export function generateMaze(random: () => number = Math.random): number[][] {
  const walls = Array.from({ length: SIZE }, () => Array(SIZE).fill(0b1111));
  const seen = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  // Row-captured writes: every coordinate below is in-bounds by construction,
  // so a missing row is impossible — the guard is type-level only.
  const setCell = <T,>(grid: T[][], x: number, y: number, value: T) => {
    const row = grid[y];
    if (row) row[x] = value;
  };
  const stack: Array<[number, number]> = [[0, 0]];
  setCell(seen, 0, 0, true);
  const dirs: Array<[number, number, number, number]> = [
    [0, -1, 0, 2],
    [1, 0, 1, 3],
    [0, 1, 2, 0],
    [-1, 0, 3, 1],
  ];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (!top) break;
    const [x, y] = top;
    const options = dirs.filter(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) return false;
      const row = seen[ny];
      return !!row && !row[nx];
    });
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const pick = options[Math.floor(random() * options.length)];
    if (!pick) continue;
    const [dx, dy, wall, opposite] = pick;
    const nx = x + dx;
    const ny = y + dy;
    setCell(walls, x, y, (walls[y]?.[x] ?? 0b1111) & ~(1 << wall));
    setCell(walls, nx, ny, (walls[ny]?.[nx] ?? 0b1111) & ~(1 << opposite));
    setCell(seen, nx, ny, true);
    stack.push([nx, ny]);
  }
  return walls;
}

/** Shortest path from (0,0) to the goal. Pure. */
export function solveMaze(walls: number[][]): Array<{ x: number; y: number }> {
  const moves: Array<[number, number, number]> = [
    [0, -1, 0],
    [1, 0, 1],
    [0, 1, 2],
    [-1, 0, 3],
  ];
  const prev = new Map<number, number>();
  const queue = [0];
  prev.set(0, -1);
  while (queue.length > 0) {
    const current = queue.shift() as number;
    if (current === GOAL.y * SIZE + GOAL.x) break;
    const x = current % SIZE;
    const y = Math.floor(current / SIZE);
    for (const [dx, dy, wall] of moves) {
      if ((((walls[y] ?? [])[x] ?? 0) & (1 << wall)) !== 0) continue;
      const next = (y + dy) * SIZE + (x + dx);
      if (!prev.has(next)) {
        prev.set(next, current);
        queue.push(next);
      }
    }
  }
  const path: Array<{ x: number; y: number }> = [];
  let at: number | undefined = GOAL.y * SIZE + GOAL.x;
  while (at !== undefined && at >= 0) {
    path.unshift({ x: at % SIZE, y: Math.floor(at / SIZE) });
    at = prev.get(at);
  }
  return path;
}

type MazeState = { walls: number[][]; path: Array<{ x: number; y: number }> };

export default function MazeRunner({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const palette = useGamePalette();
  const maze = useRef<MazeState>({ walls: generateMaze(), path: [] });
  const player = useRef({ x: 0, y: 0 });
  const [moves, setMoves] = useState(0);

  const session = useGameSession({
    slug,
    onRestart: () => {
      maze.current = { walls: generateMaze(), path: [] };
      player.current = { x: 0, y: 0 };
      setMoves(0);
    },
  });

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const { walls, path } = maze.current;
      const board = Math.min(size.width, size.height);
      const cell = board / SIZE;
      const offsetX = (size.width - board) / 2;
      const offsetY = (size.height - board) / 2;
      context.clearRect(0, 0, size.width, size.height);
      context.fillStyle = palette.sunken;
      context.fillRect(offsetX, offsetY, board, board);

      if (path.length > 0) {
        context.fillStyle = withAlpha(palette.accent, 0.3);
        for (const step of path) {
          context.fillRect(offsetX + step.x * cell + 1, offsetY + step.y * cell + 1, cell - 2, cell - 2);
        }
      }

      context.strokeStyle = palette.borderStrong;
      context.lineWidth = Math.max(1.5, cell * 0.09);
      context.beginPath();
      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          const px = offsetX + x * cell;
          const py = offsetY + y * cell;
          const w = walls[y]?.[x] ?? 0;
          if ((w & 1) !== 0) {
            context.moveTo(px, py);
            context.lineTo(px + cell, py);
          }
          if ((w & 2) !== 0) {
            context.moveTo(px + cell, py);
            context.lineTo(px + cell, py + cell);
          }
          if ((w & 4) !== 0) {
            context.moveTo(px, py + cell);
            context.lineTo(px + cell, py + cell);
          }
          if ((w & 8) !== 0) {
            context.moveTo(px, py);
            context.lineTo(px, py + cell);
          }
        }
      }
      context.stroke();

      // The goal is a ring, the player a filled square: shape, not colour.
      context.strokeStyle = palette.accent;
      context.lineWidth = Math.max(2, cell * 0.2);
      context.beginPath();
      context.arc(offsetX + (GOAL.x + 0.5) * cell, offsetY + (GOAL.y + 0.5) * cell, cell * 0.28, 0, Math.PI * 2);
      context.stroke();

      const inset = Math.max(1, cell * 0.2);
      context.fillStyle = palette.primary;
      context.fillRect(
        offsetX + player.current.x * cell + inset,
        offsetY + player.current.y * cell + inset,
        cell - inset * 2,
        cell - inset * 2,
      );
      context.fillStyle = palette.onPrimary;
      const mark = Math.max(1.5, cell * 0.2);
      context.fillRect(offsetX + (player.current.x + 0.5) * cell - mark / 2, offsetY + (player.current.y + 0.5) * cell - mark / 2, mark, mark);
    },
    [palette],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: 1, maxHeight: 560, draw, repaintKey: session.repaintKey });

  const step = (dx: number, dy: number) => {
    if (session.phase !== "playing") return;
    const { walls } = maze.current;
    const { x, y } = player.current;
    const wall = dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0;
    if ((((walls[y] ?? [])[x] ?? 0) & (1 << wall)) !== 0) return;
    const next = { x: x + dx, y: y + dy };
    player.current = next;
    maze.current.path = [];
    const count = moves + 1;
    setMoves(count);
    if (next.x === GOAL.x && next.y === GOAL.y) {
      const score = Math.max(100, 1500 - count * 5);
      session.commit({ score, level: 1, resources: count });
      session.end({ score, level: 1, resources: count });
    } else {
      session.commit({ score: 0, level: 1, resources: count });
    }
    redraw();
  };

  const onEvent = (event: GameEvent) => {
    const id = event.kind === "action" ? event.id : event.kind === "swipe" ? event.id : null;
    if (!id) return;
    if (id === "up") step(0, -1);
    else if (id === "down") step(0, 1);
    else if (id === "left") step(-1, 0);
    else if (id === "right") step(1, 0);
  };

  const trace = () => {
    maze.current.path = solveMaze(maze.current.walls);
    redraw();
  };

  const readouts = useMemo(() => [{ labelKey: "game.moves" as const, value: moves }], [moves]);

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <div style={{ display: "grid", gap: 12, justifyItems: "center", width: "100%" }}>
        <canvas ref={canvasRef} className="game-canvas" />
        <div className="game-mode-row">
          <button type="button" className="game-column-pick" style={{ padding: "0 18px" }} onClick={trace}>
            {t("game.traceSolution")}
          </button>
          <button type="button" className="game-column-pick" style={{ padding: "0 18px" }} onClick={() => session.restart()}>
            {t("game.restart")}
          </button>
        </div>
      </div>
    </GameShell>
  );
}
