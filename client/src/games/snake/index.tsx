/**
 * Snake — the reference implementation of the engine contract.
 *
 * This is the game every other one in this directory is modelled on, so it is worth
 * saying exactly what it does and does not own. It owns the rules: the grid, the
 * body, the food, the collision test and the scoring. It does not own focus, key
 * capture, `preventDefault` scoping, `touch-action`, the on-screen controls, the key
 * legend, pausing, the tab-hidden auto-pause, high-score persistence, the canvas
 * backing-store size, or the animation frame. `GameShell` and the hooks it uses own
 * all of that, which is why this file is short.
 *
 * All mutable game state lives in refs. React state would mean a re-render per frame
 * for no benefit, and — more importantly — it would mean the board is rebuilt from
 * props on a resize. Keeping it in refs is what makes a mid-run rotation on a phone
 * a pure re-measure with the run untouched.
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

/** Cells across and down. Square, so the board keeps its shape at any width. */
const COLS = 20;
const ROWS = 20;

/** Seconds between steps at level 1, and how much each level takes off. */
const BASE_STEP = 0.16;
const STEP_PER_LEVEL = 0.008;
const MIN_STEP = 0.055;

/** Food eaten before the level goes up, and points per food. */
const FOOD_PER_LEVEL = 5;
const POINTS_PER_FOOD = 10;

type Vector = { x: number; y: number };

// Keys are the four steering directions, so indexing below always lands.
const VECTORS: Record<"up" | "down" | "left" | "right", Vector> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Directions only. Snake has no action button, so declaring `primary` would print a
 * key in the legend and draw a touch button that do nothing.
 *
 * `swipe` is on in addition to the d-pad, not instead of it: a flick is the natural
 * gesture, but a visible control has to exist for anyone who does not know that.
 */
const SPEC: ControlSpec = {
  actions: ["up", "down", "left", "right"],
  surface: "canvas",
  dpad: "four",
  swipe: true,
  pointer: "none",
};

type SnakeState = {
  body: Vector[];
  direction: Vector;
  /**
   * Up to two queued turns. Without a queue, a fast "down then left" inside one step
   * loses the first turn, which is the single most common complaint about a hand-made
   * Snake.
   */
  queue: Vector[];
  food: Vector;
  eaten: number;
  score: number;
  level: number;
  /** Timer for the eat flourish, in seconds. Decorative only. */
  pulse: number;
  elapsed: number;
};

const startState = (): SnakeState => ({
  body: [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 },
    { x: 5, y: 10 },
  ],
  direction: VECTORS.right,
  queue: [],
  food: { x: 14, y: 10 },
  eaten: 0,
  score: 0,
  level: 1,
  pulse: 0,
  elapsed: 0,
});

/** A free cell for the next food. Falls back to a scan if the random probe keeps hitting the body. */
function placeFood(body: Vector[]): Vector {
  const occupied = new Set(body.map((cell) => cell.y * COLS + cell.x));
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const index = Math.floor(Math.random() * COLS * ROWS);
    if (!occupied.has(index)) return { x: index % COLS, y: Math.floor(index / COLS) };
  }
  for (let index = 0; index < COLS * ROWS; index += 1) {
    if (!occupied.has(index)) return { x: index % COLS, y: Math.floor(index / COLS) };
  }
  // Board full, which means the player has won. The next step ends the run anyway.
  // The fallback below is unreachable: callers always pass a non-empty body.
  return body[0] ?? { x: 0, y: 0 };
}

export default function Snake({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const palette = useGamePalette();
  const state = useRef<SnakeState>(startState());
  const sinceStep = useRef(0);

  const session = useGameSession({
    slug,
    onRestart: () => {
      state.current = startState();
      sinceStep.current = 0;
    },
  });

  const { reducedMotion } = session;

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

      // A faint grid, so a player can count cells and judge a gap before committing.
      context.strokeStyle = withAlpha(palette.border, 0.55);
      context.lineWidth = 1;
      context.beginPath();
      for (let index = 1; index < COLS; index += 1) {
        const at = Math.round(offsetX + index * cell) + 0.5;
        context.moveTo(at, offsetY);
        context.lineTo(at, offsetY + board);
      }
      for (let index = 1; index < ROWS; index += 1) {
        const at = Math.round(offsetY + index * cell) + 0.5;
        context.moveTo(offsetX, at);
        context.lineTo(offsetX + board, at);
      }
      context.stroke();

      context.strokeStyle = palette.borderStrong;
      context.strokeRect(offsetX + 0.5, offsetY + 0.5, board - 1, board - 1);

      const cellX = (value: number) => offsetX + value * cell;
      const cellY = (value: number) => offsetY + value * cell;

      // The eat flourish: a ring that expands and fades. Skipped entirely when the
      // player has asked for reduced motion — nothing about play depends on it.
      if (current.pulse > 0 && !reducedMotion) {
        const progress = 1 - current.pulse / 0.4;
        context.strokeStyle = withAlpha(palette.accent, 0.7 * (1 - progress));
        context.lineWidth = 2;
        context.beginPath();
        context.arc(cellX(current.food.x + 0.5), cellY(current.food.y + 0.5), cell * (0.4 + progress * 0.9), 0, Math.PI * 2);
        context.stroke();
      }

      // Food is a ring, the snake is filled squares. That difference is a shape, not a
      // colour, so the board still reads on a monochrome screen or with any theme.
      context.strokeStyle = palette.accent;
      context.lineWidth = Math.max(2, cell * 0.22);
      context.beginPath();
      context.arc(cellX(current.food.x + 0.5), cellY(current.food.y + 0.5), cell * 0.28, 0, Math.PI * 2);
      context.stroke();

      const inset = Math.max(1, cell * 0.09);
      for (let index = current.body.length - 1; index >= 0; index -= 1) {
        const segment = current.body[index];
        // Loop-bounded; the guard is type-level only.
        if (!segment) continue;
        const head = index === 0;
        context.fillStyle = head ? palette.primary : withAlpha(palette.primary, 0.72);
        context.fillRect(cellX(segment.x) + inset, cellY(segment.y) + inset, cell - inset * 2, cell - inset * 2);
      }

      // The head carries an inner mark as well as a stronger fill, so which end is
      // moving is legible without relying on the shade difference.
      const head = current.body[0];
      // The body never empties (the tail moves, it is never removed); type-level only.
      if (!head) return;
      context.fillStyle = palette.onPrimary;
      const markSize = Math.max(2, cell * 0.24);
      context.fillRect(cellX(head.x + 0.5) - markSize / 2, cellY(head.y + 0.5) - markSize / 2, markSize, markSize);
    },
    [palette, reducedMotion],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: 1, maxHeight: 560, draw, repaintKey: session.repaintKey });

  const step = useCallback(() => {
    const current = state.current;

    const turn = current.queue.shift();
    if (turn) current.direction = turn;

    const head = current.body[0];
    // The body only grows and shrinks by one per step from four segments; the
    // guard below is type-level only.
    if (!head) return;
    const next = { x: head.x + current.direction.x, y: head.y + current.direction.y };

    if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS) {
      session.end({ score: current.score, level: current.level, resources: current.eaten });
      return;
    }
    // The tail cell is excluded: it moves out of the way on this same step, so
    // following your own tail is legal and always has been.
    const tailIndex = current.body.length - 1;
    for (let index = 0; index < tailIndex; index += 1) {
      const segment = current.body[index];
      if (!segment) continue;
      if (segment.x === next.x && segment.y === next.y) {
        session.end({ score: current.score, level: current.level, resources: current.eaten });
        return;
      }
    }

    current.body.unshift(next);

    if (next.x === current.food.x && next.y === current.food.y) {
      current.eaten += 1;
      current.score += POINTS_PER_FOOD * current.level;
      current.level = Math.floor(current.eaten / FOOD_PER_LEVEL) + 1;
      current.pulse = 0.4;
      current.food = placeFood(current.body);
      session.commit({ score: current.score, level: current.level, resources: current.eaten });
    } else {
      current.body.pop();
    }
  }, [session]);

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      current.elapsed += dt;
      if (current.pulse > 0) current.pulse = Math.max(0, current.pulse - dt);

      const interval = Math.max(MIN_STEP, BASE_STEP - (current.level - 1) * STEP_PER_LEVEL);
      sinceStep.current += dt;
      // A `while` rather than an `if` so a frame that ran long still advances the
      // right number of cells. `useGameLoop` already clamps how much time can arrive.
      while (sinceStep.current >= interval) {
        sinceStep.current -= interval;
        step();
      }
      redraw();
    },
    { hz: 60 },
  );

  const onEvent = useCallback((event: GameEvent) => {
    const id = event.kind === "action" ? event.id : event.kind === "swipe" ? event.id : null;
    // Only steering keys reach the queue; anything else is a deliberate no-op.
    if (id !== "up" && id !== "down" && id !== "left" && id !== "right") return;
    const vector = VECTORS[id];

    const current = state.current;
    // Compared against the last queued turn, not the current direction, so two quick
    // turns in the same step cannot produce an illegal reversal on the second one.
    const queued = current.queue[current.queue.length - 1];
    const reference = current.queue.length > 0 && queued ? queued : current.direction;
    if (vector.x === -reference.x && vector.y === -reference.y) return;
    if (vector.x === reference.x && vector.y === reference.y) return;
    if (current.queue.length >= 2) return;
    current.queue.push(vector);
  }, []);

  const readouts = useMemo(
    () => [
      { labelKey: "game.level" as const, value: session.run.level ?? 1 },
      { labelKey: "game.food" as const, value: session.run.resources ?? 0 },
    ],
    [session.run.level, session.run.resources],
  );

  // Announced on a level change only. A score read out every time the snake eats
  // would talk over a screen-reader user for the whole run.
  const announcement = (session.run.level ?? 1) > 1 ? `${t("game.level")} ${session.run.level}` : undefined;

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} announcement={announcement} onEvent={onEvent}>
      <canvas ref={canvasRef} className="game-canvas" />
    </GameShell>
  );
}
