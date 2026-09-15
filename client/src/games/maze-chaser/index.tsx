/**
 * Maze Chaser — eat every dot, dodge the hunters, turn the tables with a
 * power pellet. The maze is carved fresh every level, so no round plays the
 * same; all four corners stay reachable because the carver never walls off
 * an odd-coordinate cell.
 *
 * Owns only its rules: queued steering, tile-step movement, three hunter
 * personalities over chase/scatter/frightened modes, and scoring. Dots are
 * the board's own paint; hunters are squares, the player a circle with a
 * mark — shape, never colour alone.
 */
import { useCallback, useRef } from "react";
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
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: ["up", "down", "left", "right"], surface: "canvas", dpad: "four", swipe: true };

const COLS = 19;
const ROWS = 13;
const PLAYER_SPEED = 7.5;
const FRIGHT_SPEED = 3.6;
const FRIGHT_TIME = 6;
const SCATTER_TIME = 5;
const CHASE_TIME = 12;
const PELLETS: Array<[number, number]> = [
  [COLS - 2, 1],
  [1, ROWS - 2],
  [COLS - 2, ROWS - 2],
  [9, 5],
];
const HUNTER_SPAWNS = [
  { x: COLS - 2, y: ROWS - 2, corner: { x: COLS - 2, y: 1 } },
  { x: 1, y: ROWS - 2, corner: { x: 1, y: ROWS - 2 } },
  { x: COLS - 2, y: 1, corner: { x: 1, y: 1 } },
];

const DIRECTIONS = ["up", "down", "left", "right"] as const;
type Direction = (typeof DIRECTIONS)[number];

const VECTORS: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Carved maze: true is walkable. Every odd/odd cell stays open. */
export function carveMaze(random: () => number = Math.random): boolean[][] {
  const open = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  // Row-captured writes: every coordinate below is in-bounds by construction,
  // so a missing row is impossible — the guard is type-level only.
  const setCell = (grid: boolean[][], x: number, y: number) => {
    const row = grid[y];
    if (row) row[x] = true;
  };
  const stack: Array<[number, number]> = [[1, 1]];
  setCell(seen, 1, 1);
  setCell(open, 1, 1);
  const dirs: Array<[number, number]> = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (!top) break;
    const [x, y] = top;
    const options = dirs.filter(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx <= 0 || nx >= COLS - 1 || ny <= 0 || ny >= ROWS - 1) return false;
      const row = seen[ny];
      return !!row && !row[nx];
    });
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const pick = options[Math.floor(random() * options.length)];
    if (!pick) continue;
    const [dx, dy] = pick;
    setCell(open, x + dx / 2, y + dy / 2);
    setCell(open, x + dx, y + dy);
    setCell(seen, x + dx, y + dy);
    stack.push([x + dx, y + dy]);
  }
  return open;
}

export function walkable(open: boolean[][], x: number, y: number): boolean {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS && (open[y]?.[x] ?? false);
}

type Mover = { tx: number; ty: number; dx: number; dy: number; progress: number };
type Hunter = Mover & { corner: { x: number; y: number }; dead: number; seed: number };

type ChaseState = {
  open: boolean[][];
  dots: Set<number>;
  pellets: Set<number>;
  player: Mover;
  queue: { x: number; y: number };
  hunters: Hunter[];
  fright: number;
  modeTimer: number;
  scatter: boolean;
  lives: number;
  score: number;
  level: number;
};

function dealDots(open: boolean[][]): { dots: Set<number>; pellets: Set<number> } {
  const dots = new Set<number>();
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if ((open[y]?.[x] ?? false) && !(x === 1 && y === 1)) dots.add(y * COLS + x);
    }
  }
  const pellets = new Set<number>();
  for (const [x, y] of PELLETS) {
    if (open[y]?.[x]) {
      pellets.add(y * COLS + x);
      dots.delete(y * COLS + x);
    }
  }
  return { dots, pellets };
}

function freshPositions(): { player: Mover; hunters: Hunter[] } {
  return {
    player: { tx: 1, ty: 1, dx: 0, dy: 0, progress: 0 },
    hunters: HUNTER_SPAWNS.map((s, i) => ({ tx: s.x, ty: s.y, dx: 0, dy: 0, progress: 0, corner: s.corner, dead: 0, seed: i * 7 + 1 })),
  };
}

const startState = (): ChaseState => {
  const open = carveMaze();
  const { dots, pellets } = dealDots(open);
  return { open, dots, pellets, ...freshPositions(), queue: { x: 0, y: 0 }, fright: 0, modeTimer: SCATTER_TIME, scatter: true, lives: 3, score: 0, level: 1 };
};

export default function MazeChaser({ slug, title }: GameModuleProps) {
  const palette = useGamePalette();
  const state = useRef<ChaseState>(startState());
  const lastSync = useRef({ score: -1, level: -1, lives: -1 });

  const session = useGameSession({
    slug,
    onRestart: () => {
      state.current = startState();
      lastSync.current = { score: -1, level: -1, lives: -1 };
    },
  });

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const current = state.current;
      const board = Math.min(size.width, size.height * (COLS / ROWS));
      const cell = board / COLS;
      const offsetX = (size.width - board) / 2;
      const offsetY = (size.height - (board * ROWS) / COLS) / 2;
      context.clearRect(0, 0, size.width, size.height);
      context.fillStyle = palette.sunken;
      context.fillRect(offsetX, offsetY, board, (board * ROWS) / COLS);

      context.fillStyle = palette.borderStrong;
      for (let y = 0; y < ROWS; y += 1) {
        for (let x = 0; x < COLS; x += 1) {
          if (!current.open[y]?.[x]) context.fillRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
        }
      }

      context.fillStyle = withAlpha(palette.text, 0.55);
      current.dots.forEach((dot) => {
        const x = dot % COLS;
        const y = Math.floor(dot / COLS);
        context.beginPath();
        context.arc(offsetX + (x + 0.5) * cell, offsetY + (y + 0.5) * cell, Math.max(1, cell * 0.09), 0, Math.PI * 2);
        context.fill();
      });
      context.fillStyle = palette.accent;
      current.pellets.forEach((pellet) => {
        const x = pellet % COLS;
        const y = Math.floor(pellet / COLS);
        context.beginPath();
        context.arc(offsetX + (x + 0.5) * cell, offsetY + (y + 0.5) * cell, Math.max(2, cell * 0.22), 0, Math.PI * 2);
        context.fill();
      });

      const at = (m: Mover) => ({ x: offsetX + (m.tx + m.dx * m.progress + 0.5) * cell, y: offsetY + (m.ty + m.dy * m.progress + 0.5) * cell });
      for (const hunter of current.hunters) {
        if (hunter.dead > 0) continue;
        const p = at(hunter);
        const frightened = current.fright > 0;
        context.fillStyle = frightened ? palette.accent : palette.danger;
        const half = cell * 0.36;
        context.fillRect(p.x - half, p.y - half, half * 2, half * 2);
        // Eyes face travel direction: a second shape cue on top of colour.
        context.fillStyle = palette.sunken;
        const ex = hunter.dx !== 0 ? Math.sign(hunter.dx) * half * 0.4 : 0;
        const ey = hunter.dy !== 0 ? Math.sign(hunter.dy) * half * 0.4 : 0;
        context.fillRect(p.x - half * 0.55 + ex, p.y - half * 0.4 + ey, half * 0.4, half * 0.5);
        context.fillRect(p.x + half * 0.15 + ex, p.y - half * 0.4 + ey, half * 0.4, half * 0.5);
      }

      const pp = at(current.player);
      context.fillStyle = palette.primary;
      context.beginPath();
      context.arc(pp.x, pp.y, cell * 0.36, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = palette.onPrimary;
      context.beginPath();
      context.arc(pp.x, pp.y, cell * 0.14, 0, Math.PI * 2);
      context.fill();
    },
    [palette],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: COLS / ROWS, maxHeight: 460, draw, repaintKey: session.repaintKey });

  const sync = () => {
    const current = state.current;
    const last = lastSync.current;
    if (last.score === current.score && last.level === current.level && last.lives === current.lives) return;
    lastSync.current = { score: current.score, level: current.level, lives: current.lives };
    session.commit({ score: current.score, level: current.level, resources: current.dots.size });
  };

  const resetPositions = (current: ChaseState) => {
    const freshPos = freshPositions();
    current.player = freshPos.player;
    current.hunters = freshPos.hunters;
    current.queue = { x: 0, y: 0 };
    current.fright = 0;
  };

  /** Advance one mover along its direction, deciding at tile centres. */
  const advance = (
    current: ChaseState,
    mover: Mover,
    speed: number,
    dt: number,
    decide: (tx: number, ty: number) => { x: number; y: number } | null,
  ) => {
    mover.progress += speed * dt;
    while (mover.progress >= 1) {
      mover.progress -= 1;
      mover.tx += mover.dx;
      mover.ty += mover.dy;
      const choice = decide(mover.tx, mover.ty);
      if (choice) {
        mover.dx = choice.x;
        mover.dy = choice.y;
      } else if (!walkable(current.open, mover.tx + mover.dx, mover.ty + mover.dy)) {
        mover.dx = 0;
        mover.dy = 0;
        mover.progress = 0;
      }
    }
  };

  const hunterTarget = (current: ChaseState, hunter: Hunter): { x: number; y: number } => {
    if (current.scatter) return hunter.corner;
    const player = current.player;
    if (hunter.seed % 3 === 0) return { x: player.tx, y: player.ty };
    if (hunter.seed % 3 === 1) return { x: player.tx + player.dx * 4, y: player.ty + player.dy * 4 };
    const dist = Math.abs(hunter.tx - player.tx) + Math.abs(hunter.ty - player.ty);
    return dist > 8 ? { x: player.tx, y: player.ty } : hunter.corner;
  };

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      const dtClamped = Math.min(dt, 0.05);

      // Chase and scatter alternate on one clock, independent of fright.
      current.modeTimer -= dtClamped;
      if (current.modeTimer <= 0) {
        current.scatter = !current.scatter;
        current.modeTimer = current.scatter ? SCATTER_TIME : CHASE_TIME;
      }
      current.fright = Math.max(0, current.fright - dtClamped);

      // The player: queued turns apply at centres, walls stop.
      advance(current, current.player, PLAYER_SPEED, dtClamped, (tx, ty) => {
        if ((current.queue.x !== 0 || current.queue.y !== 0) && walkable(current.open, tx + current.queue.x, ty + current.queue.y)) {
          return current.queue;
        }
        return null;
      });

      const playerTile = current.player.ty * COLS + current.player.tx;
      if (current.dots.has(playerTile)) {
        current.dots.delete(playerTile);
        current.score += 10;
      }
      if (current.pellets.has(playerTile)) {
        current.pellets.delete(playerTile);
        current.score += 50;
        current.fright = FRIGHT_TIME;
      }

      const hunterSpeed = Math.max(4.5, 5.6 + (current.level - 1) * 0.35);
      for (const hunter of current.hunters) {
        if (hunter.dead > 0) {
          hunter.dead -= dtClamped;
          if (hunter.dead <= 0) {
            const spawn = HUNTER_SPAWNS[hunter.seed % HUNTER_SPAWNS.length];
            if (!spawn) continue; // modulo-bounded; type-level only
            hunter.tx = spawn.x;
            hunter.ty = spawn.y;
            hunter.dx = 0;
            hunter.dy = 0;
            hunter.progress = 0;
          }
          continue;
        }
        const speed = current.fright > 0 ? FRIGHT_SPEED : hunterSpeed;
        advance(current, hunter, speed, dtClamped, (tx, ty) => {
          const options: Array<{ x: number; y: number }> = [];
          for (const key of DIRECTIONS) {
            const v = VECTORS[key];
            if (v.x === -hunter.dx && v.y === -hunter.dy) continue;
            if (walkable(current.open, tx + v.x, ty + v.y)) options.push(v);
          }
          if (options.length === 0) return { x: -hunter.dx, y: -hunter.dy };
          const [first] = options;
          if (!first) return { x: -hunter.dx, y: -hunter.dy };
          if (current.fright > 0) return options[Math.floor(Math.random() * options.length)] ?? first;
          const target = hunterTarget(current, hunter);
          let best = first;
          let bestDist = Infinity;
          for (const option of options) {
            const dist = Math.abs(tx + option.x - target.x) + Math.abs(ty + option.y - target.y);
            if (dist < bestDist) {
              bestDist = dist;
              best = option;
            }
          }
          return best;
        });
      }

      for (const hunter of current.hunters) {
        if (hunter.dead > 0) continue;
        if (hunter.tx === current.player.tx && hunter.ty === current.player.ty) {
          if (current.fright > 0) {
            hunter.dead = 2;
            current.score += 200;
          } else {
            current.lives -= 1;
            if (current.lives <= 0) {
              sync();
              session.end({ score: current.score, level: current.level, resources: 0 });
              redraw();
              return;
            }
            resetPositions(current);
          }
        }
      }

      if (current.dots.size === 0 && current.pellets.size === 0) {
        current.level += 1;
        const open = carveMaze();
        const { dots, pellets } = dealDots(open);
        current.open = open;
        current.dots = dots;
        current.pellets = pellets;
        resetPositions(current);
      }
      sync();
      redraw();
    },
    { hz: 60 },
  );

  const onEvent = useCallback((event: GameEvent) => {
    const id = event.kind === "action" ? event.id : event.kind === "swipe" ? event.id : null;
    // Only steering keys reach the queue; anything else is a deliberate no-op.
    if (id === "up" || id === "down" || id === "left" || id === "right") {
      state.current.queue = VECTORS[id];
    }
  }, []);

  // Plain array, not a memo, so no dep array can lie about ref reads.
  const readouts = [
    { labelKey: "game.lives" as const, value: state.current.lives },
    { labelKey: "game.level" as const, value: session.run.level ?? 1 },
  ];

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <canvas ref={canvasRef} className="game-canvas" />
    </GameShell>
  );
}
