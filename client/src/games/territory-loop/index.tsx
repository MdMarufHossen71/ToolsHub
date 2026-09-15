/**
 * Territory Loop — carve loops out of neutral ground while two rivals do the
 * same, on canvas. The full game: leaving home lays a live trail, closing it
 * claims everything the trail cuts off (border flood-fill), and anyone
 * caught crossing a live trail — including you on your own — is out.
 *
 * Owns only its rules: queued steering, tile-step movement, flood-fill
 * claiming, trail kills with respawns, and a three-state rival AI (push out,
 * drift wide, run home). Territory is area fill, trails are bright lines,
 * heads carry a mark — state never rides on colour alone.
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

const COLS = 24;
const ROWS = 24;
const CELLS = COLS * ROWS;
const PLAYER_SPEED = 8;
const RIVAL_SPEED = 6.2;
const PLAYER = 1;
const RIVAL_A = 2;
const RIVAL_B = 3;

const VECTORS: Record<string, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const at = (x: number, y: number) => y * COLS + x;
const inBounds = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS;

type Mover = { x: number; y: number; dx: number; dy: number; progress: number };
type Rival = Mover & { id: number; home: { x: number; y: number }; trail: number[]; mode: "out" | "back"; dead: number; goal: { x: number; y: number } };

type LoopState = {
  territory: number[];
  player: Mover;
  queue: { x: number; y: number };
  trail: number[];
  rivals: Rival[];
  lives: number;
  score: number;
  level: number;
};

function homeBlock(cornerX: number, cornerY: number, owner: number): { territory: number[]; home: { x: number; y: number } } {
  const territory = Array(CELLS).fill(0);
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      territory[at(cornerX + x, cornerY + y)] = owner;
    }
  }
  return { territory, home: { x: cornerX + 2, y: cornerY + 2 } };
}

/**
 * Claim everything the closed loop cuts off: paint the trail, flood the
 * borders through non-owner cells, and take what the flood never reached.
 * Pure.
 */

export function claimLoop(territory: number[], owner: number, trail: number[]): number[] {
  const next = territory.slice();
  for (const cell of trail) next[cell] = owner;
  const seen = new Set<number>();
  const queue: number[] = [];
  for (let x = 0; x < COLS; x += 1) {
    queue.push(at(x, 0), at(x, ROWS - 1));
  }
  for (let y = 0; y < ROWS; y += 1) {
    queue.push(at(0, y), at(COLS - 1, y));
  }
  while (queue.length > 0) {
    const cell = queue.pop() as number;
    if (seen.has(cell) || next[cell] === owner) continue;
    seen.add(cell);
    const x = cell % COLS;
    const y = Math.floor(cell / COLS);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(nx, ny)) queue.push(at(nx, ny));
    }
  }
  for (let i = 0; i < CELLS; i += 1) {
    if (next[i] !== owner && !seen.has(i)) next[i] = owner;
  }
  return next;
}

/** Share of the board owned. Pure. */
export function ownedShare(territory: number[], owner: number): number {
  let count = 0;
  for (const cell of territory) if (cell === owner) count += 1;
  return count;
}

function startState(): LoopState {
  const territory = Array(CELLS).fill(0);
  const homes = [
    homeBlock(1, ROWS - 6, PLAYER),
    homeBlock(COLS - 6, 1, RIVAL_A),
    homeBlock(COLS - 6, ROWS - 6, RIVAL_B),
  ];
  // Three literals above, so always present; the guard is type-level only.
  const [playerHome, rivalHomeA, rivalHomeB] = homes;
  if (!playerHome || !rivalHomeA || !rivalHomeB) throw new Error("homes-init-unreachable");
  for (const home of homes) {
    home.territory.forEach((value, i) => {
      if (value !== 0) territory[i] = value;
    });
  }
  return {
    territory,
    player: { x: playerHome.home.x, y: playerHome.home.y, dx: 0, dy: 0, progress: 0 },
    queue: { x: 0, y: 0 },
    trail: [],
    rivals: [
      { house: rivalHomeA, id: RIVAL_A },
      { house: rivalHomeB, id: RIVAL_B },
    ].map(({ house, id }) => ({
      x: house.home.x,
      y: house.home.y,
      dx: 0,
      dy: 0,
      progress: 0,
      id,
      home: house.home,
      trail: [],
      mode: "out" as const,
      dead: 0,
      goal: { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) },
    })),
    lives: 3,
    score: ownedShare(territory, PLAYER),
    level: 1,
  };
}

export default function TerritoryLoop({ slug, title }: GameModuleProps) {
  const palette = useGamePalette();
  const state = useRef<LoopState>(startState());
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
      const board = Math.min(size.width, size.height);
      const cell = board / COLS;
      const offsetX = (size.width - board) / 2;
      const offsetY = (size.height - board) / 2;
      context.clearRect(0, 0, size.width, size.height);
      context.fillStyle = palette.sunken;
      context.fillRect(offsetX, offsetY, board, board);

      const fills: Record<number, string> = {
        [PLAYER]: withAlpha(palette.primary, 0.5),
        [RIVAL_A]: withAlpha(palette.danger, 0.5),
        [RIVAL_B]: withAlpha(palette.accent, 0.5),
      };
      for (let i = 0; i < CELLS; i += 1) {
        const owner = current.territory[i];
        if (!owner) continue;
        // Every live owner (player + both rivals) has a fill above.
        context.fillStyle = fills[owner] ?? palette.primary;
        context.fillRect(offsetX + (i % COLS) * cell, offsetY + Math.floor(i / COLS) * cell, cell, cell);
      }

      const paintTrail = (trail: number[], owner: number) => {
        context.fillStyle = owner === PLAYER ? palette.primary : owner === RIVAL_A ? palette.danger : palette.accent;
        for (const t of trail) {
          context.fillRect(offsetX + (t % COLS) * cell, offsetY + Math.floor(t / COLS) * cell, cell, cell);
        }
      };
      paintTrail(current.trail, PLAYER);
      for (const rival of current.rivals) {
        if (rival.dead <= 0) paintTrail(rival.trail, rival.id);
      }

      const head = (m: Mover, color: string) => {
        const cx = offsetX + (m.x + m.dx * m.progress + 0.5) * cell;
        const cy = offsetY + (m.y + m.dy * m.progress + 0.5) * cell;
        context.fillStyle = color;
        context.fillRect(cx - cell * 0.36, cy - cell * 0.36, cell * 0.72, cell * 0.72);
        context.fillStyle = palette.sunken;
        context.fillRect(cx - cell * 0.12, cy - cell * 0.12, cell * 0.24, cell * 0.24);
      };
      head(current.player, palette.primary);
      for (const rival of current.rivals) {
        if (rival.dead > 0) continue;
          head(rival, rival.id === RIVAL_A ? palette.danger : palette.accent);
      }
    },
    [palette],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: 1, maxHeight: 560, draw, repaintKey: session.repaintKey });

  const sync = () => {
    const current = state.current;
    const last = lastSync.current;
    if (last.score === current.score && last.level === current.level && last.lives === current.lives) return;
    lastSync.current = { score: current.score, level: current.level, lives: current.lives };
    session.commit({ score: current.score, level: current.level, resources: current.lives });
  };

  const killPlayer = (current: LoopState) => {
    current.lives -= 1;
    current.trail = [];
    current.queue = { x: 0, y: 0 };
    // Home ground is never lost: respawn at its centre.
    outer: for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (current.territory[at(x, y)] === PLAYER) {
          current.player = { x, y, dx: 0, dy: 0, progress: 0 };
          break outer;
        }
      }
    }
  };

  /** Step one mover; on arrival the decider picks the next direction. */
  const advance = (mover: Mover, speed: number, dt: number, decide: () => { x: number; y: number } | null) => {
    mover.progress += speed * dt;
    while (mover.progress >= 1) {
      mover.progress -= 1;
      mover.x += mover.dx;
      mover.y += mover.dy;
      if (!inBounds(mover.x, mover.y)) {
        mover.x = Math.min(COLS - 1, Math.max(0, mover.x));
        mover.y = Math.min(ROWS - 1, Math.max(0, mover.y));
        mover.dx = 0;
        mover.dy = 0;
        mover.progress = 0;
        return;
      }
      const choice = decide();
      if (choice) {
        mover.dx = choice.x;
        mover.dy = choice.y;
      }
    }
  };

  /** Anyone standing on a live trail kills its owner — including the owner. */
  const checkTrails = (current: LoopState) => {
    const allTrails: Array<{ owner: number; cells: number[] }> = [{ owner: PLAYER, cells: current.trail }];
    for (const rival of current.rivals) {
      if (rival.dead <= 0) allTrails.push({ owner: rival.id, cells: rival.trail });
    }
    const movers: Array<{ owner: number; tile: number }> = [{ owner: PLAYER, tile: at(current.player.x, current.player.y) }];
    for (const rival of current.rivals) {
      if (rival.dead <= 0) movers.push({ owner: rival.id, tile: at(rival.x, rival.y) });
    }
    for (const mover of movers) {
      for (const trail of allTrails) {
        if (!trail.cells.includes(mover.tile)) continue;
        // The head of your own trail is where you stand, not a crossing —
        // without this, stepping out of home is instant death.
        if (trail.owner === mover.owner && trail.cells[trail.cells.length - 1] === mover.tile) continue;
        if (mover.owner === PLAYER) {
          killPlayer(current);
        } else if (trail.owner === mover.owner) {
          const rival = current.rivals.find((r) => r.id === mover.owner);
          if (rival) {
            rival.dead = 3;
            rival.trail = [];
          }
        } else {
          // Cut down: the victim respawns, the killer scores the trail.
          const victim = trail.owner === PLAYER ? null : current.rivals.find((r) => r.id === trail.owner);
          if (victim) {
            victim.dead = 3;
            victim.trail = [];
          } else {
            killPlayer(current);
          }
          if (mover.owner === PLAYER) current.score += 25;
        }
        break;
      }
    }
  };

  const rivalDecide = (_current: LoopState, rival: Rival): { x: number; y: number } | null => {
    const options = Object.values(VECTORS).filter(({ x, y }) => {
      if (x === -rival.dx && y === -rival.dy && (rival.dx !== 0 || rival.dy !== 0)) return false;
      return inBounds(rival.x + x, rival.y + y);
    });
    if (options.length === 0) return { x: 0, y: 0 };
    if (rival.dead > 0) return null;
      const target = rival.mode === "back" ? rival.home : rival.goal;
      const [first] = options;
      if (!first) return { x: 0, y: 0 };
      let best = first;
    let bestScore = -Infinity;
    for (const option of options) {
      const dist = Math.abs(rival.x + option.x - target.x) + Math.abs(rival.y + option.y - target.y);
      const score = -dist + Math.random() * (rival.mode === "back" ? 0.5 : 4);
      if (score > bestScore) {
        bestScore = score;
        best = option;
      }
    }
    return best;
  };

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      const step = Math.min(dt, 0.05);

      // The player.
      advance(current.player, PLAYER_SPEED, step, () => {
        if ((current.queue.x !== 0 || current.queue.y !== 0)) return current.queue;
        return null;
      });
      const tile = at(current.player.x, current.player.y);
      if (current.territory[tile] === PLAYER) {
        if (current.trail.length > 0) {
          current.territory = claimLoop(current.territory, PLAYER, current.trail);
          current.trail = [];
          current.score = ownedShare(current.territory, PLAYER);
          current.level = Math.floor(current.score / 150) + 1;
        }
      } else if (!current.trail.includes(tile)) {
        current.trail.push(tile);
      }

      // The rivals.
      for (const rival of current.rivals) {
        if (rival.dead > 0) {
          rival.dead -= step;
          if (rival.dead <= 0) {
            rival.x = rival.home.x;
            rival.y = rival.home.y;
            rival.dx = 0;
            rival.dy = 0;
            rival.progress = 0;
            rival.trail = [];
            rival.mode = "out";
            rival.goal = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
          }
          continue;
        }
        const wasHome = current.territory[at(rival.x, rival.y)] === rival.id;
        advance(rival, RIVAL_SPEED, step, () => rivalDecide(current, rival));
        const nowTile = at(rival.x, rival.y);
        const isHome = current.territory[nowTile] === rival.id;
        if (!isHome && (wasHome || rival.trail.length === 0 || rival.trail[rival.trail.length - 1] !== nowTile)) {
          if (!rival.trail.includes(nowTile)) rival.trail.push(nowTile);
        }
        if (isHome && rival.trail.length > 0) {
          current.territory = claimLoop(current.territory, rival.id, rival.trail);
          rival.trail = [];
          if (rival.mode === "back") {
            rival.mode = "out";
            rival.goal = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
          }
        } else if (rival.trail.length > 14) {
          rival.mode = "back";
        } else if (rival.mode === "out" && Math.random() < 0.005) {
          rival.goal = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
        }
      }

      checkTrails(current);

      if (current.lives <= 0) {
        sync();
        session.end({ score: current.score, level: current.level, resources: current.lives });
        redraw();
        return;
      }
      sync();
      redraw();
    },
    { hz: 60 },
  );

  const onEvent = useCallback((event: GameEvent) => {
    const id = event.kind === "action" ? event.id : event.kind === "swipe" ? event.id : null;
    if (!id) return;
    const vector = VECTORS[id];
    if (vector) state.current.queue = vector;
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
