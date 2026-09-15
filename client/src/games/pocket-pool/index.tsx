/**
 * Pocket Pool — angle the cue and sink every ball on a compact table.
 *
 * Owns only its rules: aim and power (keys, d-pad, or a pull-back drag on
 * the cloth), equal-mass ball physics with cushions and pockets, cue-ball
 * respots on a scratch, and per-ball scoring with a par bonus. A tap only
 * turns the cue; a shot needs the Action button or a real drag past a
 * minimum length, so a ranging tap can never fire by accident.
 */
import { useCallback, useRef } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
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

const SPEC: ControlSpec = {
  actions: ["left", "right", "up", "down", "primary"],
  surface: "canvas",
  dpad: "four",
  held: ["left", "right", "up", "down"],
  pointer: "drag",
};

const TABLE_W = 90;
const TABLE_H = 60;
const BALL_R = 2.2;
const POCKET_R = 4.2;
const FRICTION = 0.55;
const STOP = 1.2;
const SHOT_SPEED = 85;
const MIN_DRAG_SHOT = 0.08;
const AIM_TURN = 2.4;
const POWER_RATE = 55;

/** Fixed ball hues. Content, like card faces — the cue is white with a dot. */
const BALL_HUES = [4, 28, 48, 140, 212];

type Ball = { x: number; y: number; vx: number; vy: number; pocketed: boolean; cue: boolean; hue: number };

type PoolState = {
  balls: Ball[];
  aim: number;
  power: number;
  shots: number;
  score: number;
  rolling: boolean;
};

const POCKETS = [
  { x: 2, y: 2 },
  { x: TABLE_W / 2, y: 1.5 },
  { x: TABLE_W - 2, y: 2 },
  { x: 2, y: TABLE_H - 2 },
  { x: TABLE_W / 2, y: TABLE_H - 1.5 },
  { x: TABLE_W - 2, y: TABLE_H - 2 },
];

function rackUp(): Ball[] {
  const balls: Ball[] = [{ x: TABLE_W / 4, y: TABLE_H / 2, vx: 0, vy: 0, pocketed: false, cue: true, hue: -1 }];
  const apexX = (TABLE_W * 3) / 4;
  const apexY = TABLE_H / 2;
  let hue = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i <= row; i += 1) {
      if (balls.length - 1 >= 5) break;
      balls.push({
        x: apexX + row * BALL_R * 2.1,
        y: apexY + (i - row / 2) * BALL_R * 2.2,
        vx: 0,
        vy: 0,
        pocketed: false,
        cue: false,
        hue: BALL_HUES[hue % BALL_HUES.length] ?? 0,
      });
      hue += 1;
    }
  }
  return balls;
}

const startState = (): PoolState => ({ balls: rackUp(), aim: -Math.PI / 2, power: 45, shots: 0, score: 0, rolling: false });

/** One elastic step for equal masses: swap the normal components. Pure-ish. */
export function collidePair(a: Ball, b: Ball): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || dist >= BALL_R * 2) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = ((BALL_R * 2 - dist) / 2) * 0.9;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel >= 0) return;
  const impulse = rel;
  a.vx += impulse * nx;
  a.vy += impulse * ny;
  b.vx -= impulse * nx;
  b.vy -= impulse * ny;
}

export default function PocketPool({ slug, title }: GameModuleProps) {
  const palette = useGamePalette();
  const state = useRef<PoolState>(startState());
  const lastSync = useRef({ score: -1, shots: -1 });
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const session = useGameSession({
    slug,
    onRestart: () => {
      state.current = startState();
      lastSync.current = { score: -1, shots: -1 };
      dragStart.current = null;
    },
  });

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const current = state.current;
      const scale = Math.min(size.width / TABLE_W, size.height / TABLE_H);
      const offsetX = (size.width - TABLE_W * scale) / 2;
      const offsetY = (size.height - TABLE_H * scale) / 2;
      const X = (x: number) => offsetX + x * scale;
      const Y = (y: number) => offsetY + y * scale;

      context.clearRect(0, 0, size.width, size.height);
      context.fillStyle = palette.sunken;
      context.fillRect(offsetX, offsetY, TABLE_W * scale, TABLE_H * scale);
      context.strokeStyle = palette.borderStrong;
      context.lineWidth = Math.max(2, scale * 0.6);
      context.strokeRect(offsetX, offsetY, TABLE_W * scale, TABLE_H * scale);

      context.fillStyle = withAlpha(palette.text, 0.85);
      for (const pocket of POCKETS) {
        context.beginPath();
        context.arc(X(pocket.x), Y(pocket.y), POCKET_R * scale, 0, Math.PI * 2);
        context.fill();
      }

      // Index 0 is always the cue ball; the guard below is type-level only.
      const cue = current.balls[0];
      if (cue && !current.rolling && !cue.pocketed) {
        const length = 8 + (current.power / 100) * 22;
        context.setLineDash([4, 4]);
        context.strokeStyle = withAlpha(palette.primary, 0.85);
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(X(cue.x + Math.cos(current.aim) * (BALL_R + 1)), Y(cue.y + Math.sin(current.aim) * (BALL_R + 1)));
        context.lineTo(X(cue.x + Math.cos(current.aim) * (BALL_R + length)), Y(cue.y + Math.sin(current.aim) * (BALL_R + length)));
        context.stroke();
        context.setLineDash([]);
      }

      for (const ball of current.balls) {
        if (ball.pocketed) continue;
        context.fillStyle = ball.cue ? "#f5f5f5" : `hsl(${ball.hue}, 70%, 50%)`;
        context.beginPath();
        context.arc(X(ball.x), Y(ball.y), BALL_R * scale, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = ball.cue ? palette.text : withAlpha("#ffffff", 0.8);
        context.beginPath();
        context.arc(X(ball.x), Y(ball.y), Math.max(0.8, BALL_R * scale * 0.3), 0, Math.PI * 2);
        context.fill();
      }
    },
    [palette],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: TABLE_W / TABLE_H, maxHeight: 460, draw, repaintKey: session.repaintKey });

  const sync = () => {
    const current = state.current;
    const last = lastSync.current;
    if (last.score === current.score && last.shots === current.shots) return;
    lastSync.current = { score: current.score, shots: current.shots };
    session.commit({ score: current.score, level: 1, resources: current.shots });
  };

  const shoot = () => {
    const current = state.current;
    if (current.rolling) return;
    const cue = current.balls[0];
    if (!cue || cue.pocketed) return;
    const speed = (current.power / 100) * SHOT_SPEED;
    cue.vx = Math.cos(current.aim) * speed;
    cue.vy = Math.sin(current.aim) * speed;
    current.rolling = true;
    current.shots += 1;
    sync();
  };

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      if (!current.rolling) {
        // Aim and power stay live while the balls rest.
        const held = session.held;
        if (held.has("left")) current.aim -= AIM_TURN * dt;
        if (held.has("right")) current.aim += AIM_TURN * dt;
        if (held.has("up")) current.power = Math.min(100, current.power + POWER_RATE * dt);
        if (held.has("down")) current.power = Math.max(10, current.power - POWER_RATE * dt);
        redraw();
        return;
      }
      for (const ball of current.balls) {
        if (ball.pocketed) continue;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        const damp = Math.max(0, 1 - FRICTION * dt);
        ball.vx *= damp;
        ball.vy *= damp;
        if (Math.hypot(ball.vx, ball.vy) < STOP) {
          ball.vx = 0;
          ball.vy = 0;
        }
        if (ball.x - BALL_R < 1) {
          ball.x = 1 + BALL_R;
          ball.vx = Math.abs(ball.vx) * 0.75;
        }
        if (ball.x + BALL_R > TABLE_W - 1) {
          ball.x = TABLE_W - 1 - BALL_R;
          ball.vx = -Math.abs(ball.vx) * 0.75;
        }
        if (ball.y - BALL_R < 1) {
          ball.y = 1 + BALL_R;
          ball.vy = Math.abs(ball.vy) * 0.75;
        }
        if (ball.y + BALL_R > TABLE_H - 1) {
          ball.y = TABLE_H - 1 - BALL_R;
          ball.vy = -Math.abs(ball.vy) * 0.75;
        }
      }
      const live = current.balls.filter((b) => !b.pocketed);
      for (let i = 0; i < live.length; i += 1) {
        for (let j = i + 1; j < live.length; j += 1) {
          const a = live[i];
          const b = live[j];
          // Loop-bounded; the guard is type-level only.
          if (!a || !b) continue;
          collidePair(a, b);
        }
      }
      for (const ball of current.balls) {
        if (ball.pocketed) continue;
        for (const pocket of POCKETS) {
          if (Math.hypot(ball.x - pocket.x, ball.y - pocket.y) < POCKET_R) {
            ball.pocketed = true;
            ball.vx = 0;
            ball.vy = 0;
            if (!ball.cue) current.score += 100;
            break;
          }
        }
      }
      // A scratch resports the cue with no points lost and none gained.
      const cueBall = current.balls[0];
      if (!cueBall) return;
      if (cueBall.pocketed) {
        cueBall.pocketed = false;
        cueBall.x = TABLE_W / 4;
        cueBall.y = TABLE_H / 2;
      }
      if (current.balls.every((b) => b.pocketed || b.cue)) {
        // Every object ball is down; the respotted cue does not count.
        const bonus = Math.max(0, 300 - current.shots * 10);
        current.score += bonus;
        sync();
        session.end({ score: current.score, level: 1, resources: current.shots });
        redraw();
        return;
      }
      if (current.balls.every((b) => b.pocketed || (b.vx === 0 && b.vy === 0))) {
        current.rolling = false;
      }
      sync();
      redraw();
    },
    { hz: 60 },
  );

  // Stable identity with latest-closure semantics (same ref-mirror idiom as the
  // engine's own `eventRef`): the body only touches refs and module constants.
  const onEvent = usePersistFn((event: GameEvent) => {
    const current = state.current;
    if (event.kind === "action" && event.id === "primary" && !event.repeat) {
      shoot();
      return;
    }
    if (event.kind !== "point") return;
    // Slingshot: press near the cue ball, pull back, release to fire. A
    // short tap only turns the cue toward the finger — never a shot.
    if (event.phase === "start") {
      dragStart.current = { x: event.x, y: event.y };
    } else if (event.phase === "move" && dragStart.current) {
      const dx = (dragStart.current.x - event.x) * TABLE_W;
      const dy = (dragStart.current.y - event.y) * TABLE_H;
      if (Math.hypot(dx, dy) > 2) {
        current.aim = Math.atan2(dy, dx);
        current.power = Math.min(100, Math.max(10, Math.hypot(dx, dy) * 1.6));
      }
    } else if (event.phase === "end" && dragStart.current) {
      const dx = (dragStart.current.x - event.x) * TABLE_W;
      const dy = (dragStart.current.y - event.y) * TABLE_H;
      const pull = Math.hypot(event.x - dragStart.current.x, event.y - dragStart.current.y);
      dragStart.current = null;
      if (pull >= MIN_DRAG_SHOT) {
        current.aim = Math.atan2(dy, dx);
        current.power = Math.min(100, Math.max(10, Math.hypot(dx, dy) * 1.6));
        shoot();
      } else {
        // A tap turns the cue toward the finger without firing.
        const cue = current.balls[0];
        if (!cue) return;
        current.aim = Math.atan2(event.y * TABLE_H - cue.y, event.x * TABLE_W - cue.x);
      }
    } else if (event.phase === "cancel") {
      dragStart.current = null;
    }
  });

  // Plain array, not a memo, so no dep array can lie about ref reads.
  const readouts = [
    { labelKey: "game.moves" as const, value: session.run.resources ?? 0 },
    { labelKey: "game.level" as const, value: 1 },
  ];

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <canvas ref={canvasRef} className="game-canvas" />
    </GameShell>
  );
}
