/**
 * Tetris.
 *
 * The well, the seven pieces, the SRS-style rotation with wall kicks, gravity and
 * line clears. Everything else — focus, key capture, the on-screen buttons, the
 * legend, pausing, persistence, canvas sizing — belongs to `GameShell` and the engine
 * hooks, exactly as in Snake.
 *
 * The canvas is wider than the well on purpose: the right-hand columns carry the next
 * piece. A preview is a shape, so it has to be drawn, and drawing it inside the same
 * canvas keeps the layout to one element that scales as a unit on a phone.
 *
 * Soft drop is read from held state rather than from repeat events, because OS key
 * repeat starts after a delay of a few hundred milliseconds and a piece that stalls
 * before it starts falling faster feels broken.
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

const COLS = 10;
const ROWS = 20;
/** Columns of side panel drawn to the right of the well. */
const PANEL_COLS = 5;
const TOTAL_COLS = COLS + PANEL_COLS;

/** Seconds per row of gravity at level 1, and the multiplier each level applies. */
const BASE_FALL = 0.8;
const FALL_PER_LEVEL = 0.86;
const MIN_FALL = 0.06;

/** Rows a soft drop covers per second, independent of level. */
const SOFT_DROP_ROWS_PER_SECOND = 18;

/** Lines needed per level, and the points each simultaneous clear count is worth. */
const LINES_PER_LEVEL = 10;
const CLEAR_POINTS = [0, 100, 300, 500, 800];

/**
 * How long a piece may rest on the stack before it locks, in seconds. Without this a
 * piece locks the instant it lands and a last-moment slide is impossible.
 */
const LOCK_DELAY = 0.5;

/**
 * The seven pieces as rotation states, each a list of filled offsets.
 *
 * Written out rather than rotated at runtime: a matrix rotation has to agree with the
 * kick table about where the centre is, and four hand-checked states per piece is
 * both shorter to read and impossible to get subtly wrong.
 */
type Cell = { x: number; y: number };
type Piece = { id: number; states: Cell[][] };

const cells = (...pairs: Array<[number, number]>): Cell[] => pairs.map(([x, y]) => ({ x, y }));

const PIECES: Piece[] = [
  // I
  {
    id: 1,
    states: [
      cells([0, 1], [1, 1], [2, 1], [3, 1]),
      cells([2, 0], [2, 1], [2, 2], [2, 3]),
      cells([0, 2], [1, 2], [2, 2], [3, 2]),
      cells([1, 0], [1, 1], [1, 2], [1, 3]),
    ],
  },
  // J
  {
    id: 2,
    states: [
      cells([0, 0], [0, 1], [1, 1], [2, 1]),
      cells([1, 0], [2, 0], [1, 1], [1, 2]),
      cells([0, 1], [1, 1], [2, 1], [2, 2]),
      cells([1, 0], [1, 1], [0, 2], [1, 2]),
    ],
  },
  // L
  {
    id: 3,
    states: [
      cells([2, 0], [0, 1], [1, 1], [2, 1]),
      cells([1, 0], [1, 1], [1, 2], [2, 2]),
      cells([0, 1], [1, 1], [2, 1], [0, 2]),
      cells([0, 0], [1, 0], [1, 1], [1, 2]),
    ],
  },
  // O
  {
    id: 4,
    states: [
      cells([1, 0], [2, 0], [1, 1], [2, 1]),
      cells([1, 0], [2, 0], [1, 1], [2, 1]),
      cells([1, 0], [2, 0], [1, 1], [2, 1]),
      cells([1, 0], [2, 0], [1, 1], [2, 1]),
    ],
  },
  // S
  {
    id: 5,
    states: [
      cells([1, 0], [2, 0], [0, 1], [1, 1]),
      cells([1, 0], [1, 1], [2, 1], [2, 2]),
      cells([1, 1], [2, 1], [0, 2], [1, 2]),
      cells([0, 0], [0, 1], [1, 1], [1, 2]),
    ],
  },
  // T
  {
    id: 6,
    states: [
      cells([1, 0], [0, 1], [1, 1], [2, 1]),
      cells([1, 0], [1, 1], [2, 1], [1, 2]),
      cells([0, 1], [1, 1], [2, 1], [1, 2]),
      cells([1, 0], [0, 1], [1, 1], [1, 2]),
    ],
  },
  // Z
  {
    id: 7,
    states: [
      cells([0, 0], [1, 0], [1, 1], [2, 1]),
      cells([2, 0], [1, 1], [2, 1], [1, 2]),
      cells([0, 1], [1, 1], [1, 2], [2, 2]),
      cells([1, 0], [0, 1], [1, 1], [0, 2]),
    ],
  },
];

/**
 * Wall kicks, tried in order after the plain rotation fails.
 *
 * Not the full SRS table — that needs a separate column per rotation pair and per
 * piece family, which is a lot of data for a difference most players never notice.
 * These five offsets recover the cases that actually come up: a piece against either
 * wall, and a piece resting on the stack that needs one row of lift.
 */
const KICKS: Cell[] = cells([0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]);

type Active = { piece: Piece; rotation: number; x: number; y: number };

type TetrisState = {
  /** Row-major well. 0 is empty, otherwise the piece id that filled it. */
  well: number[];
  active: Active | null;
  next: Piece;
  /** Shuffled bag, drained one piece at a time. A bag cannot deal a seventh S in a row. */
  bag: Piece[];
  score: number;
  lines: number;
  level: number;
  /** Seconds until the next gravity step. */
  fallTimer: number;
  /** Seconds the piece has been resting on the stack, or null when it is airborne. */
  restingFor: number | null;
  /** Rows of the last clear, for the flash. Decorative only. */
  flashRows: number[];
  flashTimer: number;
};

/** Fisher-Yates over a copy of the seven pieces. */
function shuffledBag(): Piece[] {
  const bag = PIECES.slice();
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const a = bag[index];
    const b = bag[swap];
    // Loop-bounded on both sides; the guard is type-level only.
    if (a === undefined || b === undefined) continue;
    bag[index] = b;
    bag[swap] = a;
  }
  return bag;
}

const startState = (): TetrisState => {
  const bag = shuffledBag();
  // Seven pieces by construction; the throw below is type-level only.
  const next = bag.pop();
  if (!next) throw new Error("bag-empty-unreachable");
  return {
    well: new Array(COLS * ROWS).fill(0),
    active: null,
    next,
    bag,
    score: 0,
    lines: 0,
    level: 1,
    fallTimer: BASE_FALL,
    restingFor: null,
    flashRows: [],
    flashTimer: 0,
  };
};

const fallInterval = (level: number) => Math.max(MIN_FALL, BASE_FALL * FALL_PER_LEVEL ** (level - 1));

/** Absolute cells a piece occupies at a given rotation and position. */
function occupied(active: Active): Cell[] {
  // Rotations always index a real state (each piece declares 1, 2 or 4, and the
  // rotation wraps modulo that count); anything else is a logic bug, fail loudly.
  const states = active.piece.states[active.rotation];
  if (!states) throw new Error("rotation-out-of-range");
  return states.map((cell) => ({ x: active.x + cell.x, y: active.y + cell.y }));
}

/**
 * True when a piece may sit here. A cell above the top of the well is allowed, so a
 * piece can spawn partly off screen and still be moved; only the floor, the walls and
 * filled cells block.
 */
function fits(well: number[], active: Active): boolean {
  for (const cell of occupied(active)) {
    if (cell.x < 0 || cell.x >= COLS || cell.y >= ROWS) return false;
    if (cell.y >= 0 && well[cell.y * COLS + cell.x] !== 0) return false;
  }
  return true;
}

const SPEC: ControlSpec = {
  actions: ["left", "right", "down", "rotateCw", "rotateCcw", "drop"],
  surface: "canvas",
  dpad: "four",
  swipe: true,
  pointer: "none",
  // Soft drop and the two horizontal moves repeat while held, so all three are sampled
  // in the tick instead of arriving as auto-repeat events.
  held: ["left", "right", "down"],
};

/** Seconds between repeats while a direction is held, after the first move. */
const REPEAT_DELAY = 0.16;
const REPEAT_RATE = 0.05;

export default function Tetris({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const palette = useGamePalette();
  const state = useRef<TetrisState>(startState());
  /** Countdown to the next horizontal repeat, and which way it is repeating. */
  const repeat = useRef<{ dir: -1 | 0 | 1; timer: number }>({ dir: 0, timer: 0 });
  const softDrop = useRef(0);

  const session = useGameSession({
    slug,
    onRestart: () => {
      state.current = startState();
      repeat.current = { dir: 0, timer: 0 };
      softDrop.current = 0;
    },
  });

  const { reducedMotion } = session;

  /** Colour per piece id. Six hues from the theme plus two washes, so any theme works. */
  const pieceColours = useMemo(
    () => [
      "",
      palette.primary,
      palette.accent,
      palette.borderStrong,
      withAlpha(palette.primary, 0.62),
      withAlpha(palette.accent, 0.62),
      palette.text,
      withAlpha(palette.text, 0.5),
    ],
    [palette],
  );

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const current = state.current;
      const cell = Math.min(size.width / TOTAL_COLS, size.height / ROWS);
      const wellWidth = cell * COLS;
      const wellHeight = cell * ROWS;
      const offsetX = (size.width - cell * TOTAL_COLS) / 2;
      const offsetY = (size.height - wellHeight) / 2;

      context.clearRect(0, 0, size.width, size.height);
      context.fillStyle = palette.sunken;
      context.fillRect(offsetX, offsetY, wellWidth, wellHeight);

      context.strokeStyle = withAlpha(palette.border, 0.5);
      context.lineWidth = 1;
      context.beginPath();
      for (let index = 1; index < COLS; index += 1) {
        const at = Math.round(offsetX + index * cell) + 0.5;
        context.moveTo(at, offsetY);
        context.lineTo(at, offsetY + wellHeight);
      }
      for (let index = 1; index < ROWS; index += 1) {
        const at = Math.round(offsetY + index * cell) + 0.5;
        context.moveTo(offsetX, at);
        context.lineTo(offsetX + wellWidth, at);
      }
      context.stroke();

      /** One block, with a lighter inner face so the grid stays readable when full. */
      const block = (gridX: number, gridY: number, colour: string, ghost = false) => {
        const x = offsetX + gridX * cell;
        const y = offsetY + gridY * cell;
        const inset = Math.max(1, cell * 0.08);
        if (ghost) {
          context.strokeStyle = colour;
          context.lineWidth = Math.max(1, cell * 0.1);
          context.strokeRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
          return;
        }
        context.fillStyle = colour;
        context.fillRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
        context.fillStyle = withAlpha(palette.onInk, 0.16);
        context.fillRect(x + inset, y + inset, cell - inset * 2, Math.max(1, cell * 0.18));
      };

      for (let index = 0; index < current.well.length; index += 1) {
        const value = current.well[index] ?? 0;
        if (value === 0) continue;
        block(index % COLS, Math.floor(index / COLS), pieceColours[value] ?? "");
      }

      // Cleared rows flash before they vanish. Purely decorative, so it is skipped for
      // a player who has asked for reduced motion.
      if (current.flashTimer > 0 && !reducedMotion) {
        context.fillStyle = withAlpha(palette.text, 0.35 * (current.flashTimer / 0.18));
        for (const row of current.flashRows) {
          context.fillRect(offsetX, offsetY + row * cell, wellWidth, cell);
        }
      }

      if (current.active) {
        // The landing shadow. It is the difference between a guess and a placement, and
        // it is a shape rather than a shade, so it survives any theme.
        const ghost: Active = { ...current.active };
        while (fits(current.well, { ...ghost, y: ghost.y + 1 })) ghost.y += 1;
        for (const point of occupied(ghost)) {
          if (point.y < 0) continue;
          block(point.x, point.y, withAlpha(palette.text, 0.32), true);
        }
        for (const point of occupied(current.active)) {
          if (point.y < 0) continue;
          block(point.x, point.y, pieceColours[current.active.piece.id] ?? "");
        }
      }

      context.strokeStyle = palette.borderStrong;
      context.strokeRect(offsetX + 0.5, offsetY + 0.5, wellWidth - 1, wellHeight - 1);

      // The side panel: the word "Next" and the coming piece, drawn at the same cell
      // size as the well so the shape reads the same in both places.
      const panelX = offsetX + wellWidth + cell * 0.6;
      context.fillStyle = palette.muted;
      context.font = `${Math.max(9, Math.round(cell * 0.52))}px var(--font-code, monospace)`;
      context.textBaseline = "top";
      context.fillText(t("game.next"), panelX, offsetY + cell * 0.3);

      const preview = current.next.states[0];
      // Every piece declares at least one rotation state; type-level only.
      if (!preview) return;
      const minX = Math.min(...preview.map((c) => c.x));
      const minY = Math.min(...preview.map((c) => c.y));
      const previewCell = cell * 0.8;
      for (const point of preview) {
        const x = panelX + (point.x - minX) * previewCell;
        const y = offsetY + cell * 1.4 + (point.y - minY) * previewCell;
        const inset = Math.max(1, previewCell * 0.08);
        context.fillStyle = pieceColours[current.next.id] ?? "";
        context.fillRect(x + inset, y + inset, previewCell - inset * 2, previewCell - inset * 2);
      }
    },
    [palette, pieceColours, reducedMotion, t],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: TOTAL_COLS / ROWS, maxHeight: 560, draw, repaintKey: session.repaintKey });

  /** Takes the next piece from the bag, refilling it when empty. */
  const drawPiece = useCallback((current: TetrisState): Piece => {
    if (current.bag.length === 0) current.bag = shuffledBag();
    return current.bag.pop() as Piece;
  }, []);

  /** Spawns the queued piece. Returns false when it does not fit, which ends the run. */
  const spawn = useCallback(
    (current: TetrisState): boolean => {
      const piece = current.next;
      current.next = drawPiece(current);
      const active: Active = { piece, rotation: 0, x: Math.floor((COLS - 4) / 2), y: -1 };
      if (!fits(current.well, active)) return false;
      current.active = active;
      current.fallTimer = fallInterval(current.level);
      current.restingFor = null;
      return true;
    },
    [drawPiece],
  );

  /** Writes the piece into the well, clears full rows and scores them. */
  const lock = useCallback(
    (current: TetrisState) => {
      const active = current.active;
      if (!active) return;
      for (const point of occupied(active)) {
        if (point.y < 0) continue;
        current.well[point.y * COLS + point.x] = active.piece.id;
      }
      current.active = null;

      const full: number[] = [];
      for (let row = 0; row < ROWS; row += 1) {
        let complete = true;
        for (let col = 0; col < COLS; col += 1) {
          if (current.well[row * COLS + col] === 0) {
            complete = false;
            break;
          }
        }
        if (complete) full.push(row);
      }

      if (full.length > 0) {
        // Rebuilt from the rows that survive rather than spliced in place: splicing
        // while iterating is where an off-by-one in a line clear normally hides.
        const kept: number[] = [];
        for (let row = 0; row < ROWS; row += 1) {
          if (full.includes(row)) continue;
          for (let col = 0; col < COLS; col += 1) kept.push(current.well[row * COLS + col] ?? 0);
        }
        const empty = new Array(full.length * COLS).fill(0);
        current.well = empty.concat(kept);
        current.lines += full.length;
        current.score += (CLEAR_POINTS[full.length] ?? 0) * current.level;
        current.level = Math.floor(current.lines / LINES_PER_LEVEL) + 1;
        current.flashRows = full;
        current.flashTimer = 0.18;
        session.commit({ score: current.score, level: current.level, resources: current.lines });
      }

      if (!spawn(current)) {
        session.end({ score: current.score, level: current.level, resources: current.lines });
      }
    },
    [session, spawn],
  );

  /** One row down, or a lock if it cannot. Returns whether the piece moved. */
  const stepDown = useCallback((current: TetrisState): boolean => {
    const active = current.active;
    if (!active) return false;
    if (fits(current.well, { ...active, y: active.y + 1 })) {
      active.y += 1;
      current.restingFor = null;
      return true;
    }
    // Resting. The lock delay is counted in the tick, not here.
    if (current.restingFor === null) current.restingFor = 0;
    return false;
  }, []);

  const move = useCallback((current: TetrisState, dx: number) => {
    const active = current.active;
    if (!active) return;
    if (!fits(current.well, { ...active, x: active.x + dx })) return;
    active.x += dx;
    // A successful slide refreshes the lock delay, which is what makes a last-moment
    // tuck into a gap possible.
    if (current.restingFor !== null) current.restingFor = 0;
  }, []);

  const rotate = useCallback((current: TetrisState, turn: 1 | -1) => {
    const active = current.active;
    if (!active) return;
    const rotation = (active.rotation + turn + 4) % 4;
    for (const kick of KICKS) {
      const candidate: Active = { ...active, rotation, x: active.x + kick.x, y: active.y + kick.y };
      if (!fits(current.well, candidate)) continue;
      active.rotation = candidate.rotation;
      active.x = candidate.x;
      active.y = candidate.y;
      if (current.restingFor !== null) current.restingFor = 0;
      return;
    }
  }, []);

  const hardDrop = useCallback(
    (current: TetrisState) => {
      const active = current.active;
      if (!active) return;
      let rows = 0;
      while (fits(current.well, { ...active, y: active.y + 1 })) {
        active.y += 1;
        rows += 1;
      }
      // Two points a row, the long-standing convention, so a hard drop is worth taking.
      current.score += rows * 2;
      lock(current);
    },
    [lock],
  );

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      if (current.flashTimer > 0) current.flashTimer = Math.max(0, current.flashTimer - dt);

      if (!current.active) {
        if (!spawn(current)) {
          session.end({ score: current.score, level: current.level, resources: current.lines });
          return;
        }
      }

      // Held horizontal movement: one move immediately on press, then a repeat after a
      // short delay. The initial move happens in `onEvent`; this only handles the repeat.
      const axis = session.held.axisX();
      const dir = axis > 0 ? 1 : axis < 0 ? -1 : 0;
      if (dir === 0) {
        repeat.current.dir = 0;
        repeat.current.timer = 0;
      } else if (dir !== repeat.current.dir) {
        repeat.current.dir = dir;
        repeat.current.timer = REPEAT_DELAY;
      } else {
        repeat.current.timer -= dt;
        while (repeat.current.timer <= 0) {
          repeat.current.timer += REPEAT_RATE;
          move(current, dir);
        }
      }

      if (session.held.has("down")) {
        softDrop.current += dt * SOFT_DROP_ROWS_PER_SECOND;
        while (softDrop.current >= 1) {
          softDrop.current -= 1;
          // A point a row, so holding down is rewarded but never as much as a hard drop.
          if (stepDown(current)) current.score += 1;
          else break;
        }
      } else {
        softDrop.current = 0;
      }

      current.fallTimer -= dt;
      while (current.fallTimer <= 0) {
        current.fallTimer += fallInterval(current.level);
        stepDown(current);
      }

      if (current.restingFor !== null) {
        current.restingFor += dt;
        if (current.restingFor >= LOCK_DELAY) lock(current);
      }

      session.commit({ score: current.score, level: current.level, resources: current.lines });
      redraw();
    },
    { hz: 60 },
  );

  const onEvent = useCallback(
    (event: GameEvent) => {
      const current = state.current;
      const id = event.kind === "action" ? event.id : event.kind === "swipe" ? event.id : null;
      if (!id) return;
      // A swipe down is a hard drop, which is the gesture a player expects; the on-screen
      // down button is a soft drop, which is what a held key does.
      if (event.kind === "swipe" && id === "down") {
        hardDrop(current);
        return;
      }
      if (event.kind === "action" && event.repeat) return;
      switch (id) {
        case "left":
          move(current, -1);
          return;
        case "right":
          move(current, 1);
          return;
        case "down":
          stepDown(current);
          return;
        case "up":
        case "rotateCw":
          rotate(current, 1);
          return;
        case "rotateCcw":
          rotate(current, -1);
          return;
        case "drop":
          hardDrop(current);
          return;
        default:
          return;
      }
    },
    [hardDrop, move, rotate, stepDown],
  );

  const readouts = useMemo(
    () => [
      { labelKey: "game.level" as const, value: session.run.level ?? 1 },
      { labelKey: "game.lines" as const, value: session.run.resources ?? 0 },
    ],
    [session.run.level, session.run.resources],
  );

  const announcement = (session.run.level ?? 1) > 1 ? `${t("game.level")} ${session.run.level}` : undefined;

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} announcement={announcement} onEvent={onEvent}>
      <canvas ref={canvasRef} className="game-canvas" />
    </GameShell>
  );
}
