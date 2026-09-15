/**
 * Dino Dash — an accelerating desert run, on canvas.
 *
 * Owns only its rules: gravity jumps, hold-to-duck, a spawner whose gaps
 * tighten as speed climbs, and rectangle collisions against a duck-aware
 * hitbox. Jump answers up/primary; duck samples the held down key in the
 * tick, so a long press ducks under a whole flock. Birds fly at head height
 * (duck), cacti hug the ground (jump) — the obstacle tells you the move.
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
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = {
  actions: ["up", "down", "primary"],
  surface: "canvas",
  dpad: "vertical",
  swipe: true,
  held: ["down"],
};

const WORLD_W = 120;
const WORLD_H = 60;
const GROUND_Y = 50;
const DINO_X = 20;
const DINO_W = 6;
const DINO_H = 9;
const DUCK_H = 4.5;
const GRAVITY = 170;
const JUMP_VELOCITY = 62;
const BASE_SPEED = 34;
const SPEED_PER_LEVEL = 4;
const METRES_PER_LEVEL = 250;

type Obstacle = { x: number; kind: "cactus" | "bird"; w: number; h: number; y: number };

type DashState = {
  y: number;
  vy: number;
  grounded: boolean;
  obstacles: Obstacle[];
  spawnIn: number;
  distance: number;
  score: number;
  level: number;
};

const startState = (): DashState => ({
  y: GROUND_Y,
  vy: 0,
  grounded: true,
  obstacles: [],
  spawnIn: 1,
  distance: 0,
  score: 0,
  level: 1,
});

function spawnObstacle(): Obstacle {
  const bird = Math.random() < 0.35;
  if (bird) {
    // Head height: jumping meets it, ducking passes under.
    return { x: WORLD_W + 6, kind: "bird", w: 7, h: 3.5, y: GROUND_Y - DINO_H + 1 };
  }
  const tall = Math.random() < 0.4;
  return { x: WORLD_W + 6, kind: "cactus", w: tall ? 4 : 6, h: tall ? 11 : 7, y: GROUND_Y };
}

export default function DinoDash({ slug, title }: GameModuleProps) {
  const palette = useGamePalette();
  const state = useRef<DashState>(startState());
  const lastSync = useRef({ score: -1, level: -1 });

  const session = useGameSession({
    slug,
    onRestart: () => {
      state.current = startState();
      lastSync.current = { score: -1, level: -1 };
    },
  });

  const { reducedMotion } = session;

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const current = state.current;
      const scale = Math.min(size.width / WORLD_W, size.height / WORLD_H);
      const offsetX = (size.width - WORLD_W * scale) / 2;
      const offsetY = (size.height - WORLD_H * scale) / 2;
      const X = (x: number) => offsetX + x * scale;
      const Y = (y: number) => offsetY + y * scale;

      context.clearRect(0, 0, size.width, size.height);
      context.fillStyle = palette.sunken;
      context.fillRect(offsetX, offsetY, WORLD_W * scale, WORLD_H * scale);

      context.strokeStyle = palette.borderStrong;
      context.lineWidth = Math.max(1.5, scale * 0.5);
      context.beginPath();
      context.moveTo(offsetX, Y(GROUND_Y) + 0.5);
      context.lineTo(offsetX + WORLD_W * scale, Y(GROUND_Y) + 0.5);
      context.stroke();

      // Speed dashes on the ground. Purely decorative: frozen entirely under
      // reduced motion while the run itself keeps moving.
      if (!reducedMotion) {
        context.strokeStyle = withAlpha(palette.muted, 0.5);
        context.lineWidth = 1;
        const offset = (current.distance * 2) % 12;
        context.beginPath();
        for (let x = -12; x < WORLD_W + 12; x += 12) {
          const dx = x - offset;
          context.moveTo(X(dx), Y(GROUND_Y) + 3 * scale);
          context.lineTo(X(dx) + 4 * scale, Y(GROUND_Y) + 3 * scale);
        }
        context.stroke();
      }

      for (const obstacle of current.obstacles) {
        if (obstacle.kind === "bird") {
          // Wings up versus body: a bird reads differently from a cactus even
          // in one colour.
          context.fillStyle = palette.danger;
          context.fillRect(X(obstacle.x), Y(obstacle.y), obstacle.w * scale, obstacle.h * scale);
          context.fillRect(X(obstacle.x) + scale, Y(obstacle.y) - 2 * scale, 3 * scale, 2 * scale);
        } else {
          context.fillStyle = withAlpha(palette.danger, 0.9);
          context.fillRect(X(obstacle.x), Y(obstacle.y - obstacle.h), obstacle.w * scale, obstacle.h * scale);
        }
      }

      const ducking = session.held.has("down") && current.grounded;
      const height = ducking ? DUCK_H : DINO_H;
      const top = current.y - height;
      context.fillStyle = palette.primary;
      context.fillRect(X(DINO_X), Y(top), DINO_W * scale, height * scale);
      context.fillStyle = palette.onPrimary;
      const eye = Math.max(1, scale * 0.8);
      context.fillRect(X(DINO_X) + DINO_W * scale - 2.4 * scale, Y(top) + 1.4 * scale, eye, eye);
    },
    [palette, reducedMotion, session.held],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: WORLD_W / WORLD_H, maxHeight: 420, draw, repaintKey: session.repaintKey });

  const sync = () => {
    const current = state.current;
    const last = lastSync.current;
    if (last.score === current.score && last.level === current.level) return;
    lastSync.current = { score: current.score, level: current.level };
    session.commit({ score: current.score, level: current.level, resources: Math.floor(current.distance) });
  };

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      const speed = BASE_SPEED + (current.level - 1) * SPEED_PER_LEVEL;
      current.distance += speed * dt;
      current.score = Math.floor(current.distance / 10);
      current.level = Math.floor(current.distance / METRES_PER_LEVEL) + 1;

      if (!current.grounded) {
        current.vy -= GRAVITY * dt;
        current.y -= current.vy * dt;
        if (current.y >= GROUND_Y) {
          current.y = GROUND_Y;
          current.vy = 0;
          current.grounded = true;
        }
      }

      current.spawnIn -= dt;
      if (current.spawnIn <= 0) {
        current.spawnIn = Math.max(0.45, 0.9 + Math.random() * 0.7 - (current.level - 1) * 0.05);
        current.obstacles.push(spawnObstacle());
      }
      for (const obstacle of current.obstacles) obstacle.x -= speed * dt;
      current.obstacles = current.obstacles.filter((o) => o.x + o.w > -4);

      const ducking = session.held.has("down") && current.grounded;
      const height = ducking ? DUCK_H : DINO_H;
      const top = current.y - height;
      for (const obstacle of current.obstacles) {
        const oTop = obstacle.y - obstacle.h;
        if (DINO_X < obstacle.x + obstacle.w && DINO_X + DINO_W > obstacle.x && top < obstacle.y && top + height > oTop) {
          sync();
          session.end({ score: current.score, level: current.level, resources: Math.floor(current.distance) });
          redraw();
          return;
        }
      }
      sync();
      redraw();
    },
    { hz: 60 },
  );

  const onEvent = useCallback((event: GameEvent) => {
    // Jump only: ducking is sampled from the held down key in the tick, and a
    // momentary swipe cannot hold it. Repeats are ignored so a held Space
    // does not queue jumps.
    if (event.kind === "action") {
      if (event.repeat || (event.id !== "up" && event.id !== "primary")) return;
    } else if (event.kind === "swipe") {
      if (event.id !== "up") return;
    } else {
      return;
    }
    const current = state.current;
    if (current.grounded) {
      current.grounded = false;
      current.vy = JUMP_VELOCITY;
    }
  }, []);

  const readouts = useMemo(
    () => [
      { labelKey: "game.level" as const, value: session.run.level ?? 1 },
      { labelKey: "game.moves" as const, value: session.run.resources ?? 0 },
    ],
    [session.run.level, session.run.resources],
  );

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <canvas ref={canvasRef} className="game-canvas" />
    </GameShell>
  );
}
