/**
 * Asteroids — drift, rotate, thrust and split the rocks, on canvas.
 *
 * Owns only its rules: inertia with a whisper of drag, screen wrap,
 * three rock sizes that split downward, cooldown-gated fire, a hyperspace
 * escape with its own cooldown, and brief spawn protection drawn as a ring.
 * Rotation and thrust sample held keys in the tick; fire and hyperspace are
 * discrete events through one cooldown each. The ship is a triangle, rocks
 * are stroked polygons — shape, never colour alone.
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
import { useTranslation } from "@/contexts/AppSettingsContext";

const SPEC: ControlSpec = {
  actions: ["left", "right", "up", "primary", "secondary"],
  surface: "canvas",
  dpad: "four",
  held: ["left", "right", "up"],
};

const WORLD = 100;
const TURN_SPEED = 3.4;
const THRUST = 58;
const DRAG = 0.35;
const BULLET_SPEED = 115;
const BULLET_LIFE = 1.1;
const FIRE_COOLDOWN = 0.24;
const HYPER_COOLDOWN = 6;
const PROTECT_TIME = 2;
const ROCK_RADIUS = [0, 3, 5.2, 9];
const ROCK_SCORE = [0, 100, 50, 20];

export type Rock = { x: number; y: number; vx: number; vy: number; size: 1 | 2 | 3; spin: number; angle: number; verts: number[] };
type Bullet = { x: number; y: number; vx: number; vy: number; life: number };

type RockState = {
  ship: { x: number; y: number; vx: number; vy: number; angle: number };
  rocks: Rock[];
  bullets: Bullet[];
  fireTimer: number;
  hyperTimer: number;
  protect: number;
  lives: number;
  score: number;
  level: number;
};

function rockSpeed(level: number): number {
  return 6 + level * 1.5;
}

/** A rock far from the ship, so no wave starts as a death sentence. Pure-ish. */
export function spawnRock(level: number, shipX: number, shipY: number, size: 1 | 2 | 3): Rock {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const x = Math.random() * WORLD;
    const y = Math.random() * WORLD;
    const dx = Math.min(Math.abs(x - shipX), WORLD - Math.abs(x - shipX));
    const dy = Math.min(Math.abs(y - shipY), WORLD - Math.abs(y - shipY));
    if (Math.hypot(dx, dy) > 30) {
      const angle = Math.random() * Math.PI * 2;
      const speed = rockSpeed(level) * (0.6 + Math.random() * 0.8);
      const verts = Array.from({ length: 9 }, () => 0.75 + Math.random() * 0.5);
      return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size, spin: (Math.random() - 0.5) * 1.4, angle: 0, verts };
    }
  }
  return { x: 5, y: 5, vx: 4, vy: 3, size, spin: 0.5, angle: 0, verts: Array(9).fill(1) };
}

function startWave(level: number, shipX: number, shipY: number): Rock[] {
  const count = Math.min(3 + level, 8);
  return Array.from({ length: count }, () => spawnRock(level, shipX, shipY, 3));
}

const startState = (): RockState => ({
  ship: { x: WORLD / 2, y: WORLD / 2, vx: 0, vy: 0, angle: -Math.PI / 2 },
  rocks: [],
  bullets: [],
  fireTimer: FIRE_COOLDOWN,
  hyperTimer: HYPER_COOLDOWN,
  protect: PROTECT_TIME,
  lives: 3,
  score: 0,
  level: 1,
});

function wrap(value: number): number {
  if (value < 0) return value + WORLD;
  if (value >= WORLD) return value - WORLD;
  return value;
}

export default function Asteroids({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const palette = useGamePalette();
  const state = useRef<RockState>({ ...startState(), rocks: startWave(1, WORLD / 2, WORLD / 2) });
  const lastSync = useRef({ score: -1, level: -1, lives: -1 });

  const session = useGameSession({
    slug,
    onRestart: () => {
      state.current = { ...startState(), rocks: startWave(1, WORLD / 2, WORLD / 2) };
      lastSync.current = { score: -1, level: -1, lives: -1 };
    },
  });

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const current = state.current;
      const scale = Math.min(size.width / WORLD, size.height / WORLD);
      const offsetX = (size.width - WORLD * scale) / 2;
      const offsetY = (size.height - WORLD * scale) / 2;
      const X = (x: number) => offsetX + x * scale;
      const Y = (y: number) => offsetY + y * scale;

      context.clearRect(0, 0, size.width, size.height);
      context.fillStyle = palette.sunken;
      context.fillRect(offsetX, offsetY, WORLD * scale, WORLD * scale);

      context.strokeStyle = palette.borderStrong;
      context.lineWidth = Math.max(1.5, scale * 0.4);
      for (const rock of current.rocks) {
        context.beginPath();
        rock.verts.forEach((v, i) => {
          const a = rock.angle + (i / rock.verts.length) * Math.PI * 2;
          const r = (ROCK_RADIUS[rock.size] ?? 0) * v;
          const px = X(rock.x + Math.cos(a) * r);
          const py = Y(rock.y + Math.sin(a) * r);
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        });
        context.closePath();
        context.stroke();
      }

      context.fillStyle = palette.primary;
      for (const bullet of current.bullets) {
        context.beginPath();
        context.arc(X(bullet.x), Y(bullet.y), Math.max(1.2, scale * 0.5), 0, Math.PI * 2);
        context.fill();
      }

      const ship = current.ship;
      context.save();
      context.translate(X(ship.x), Y(ship.y));
      context.rotate(ship.angle + Math.PI / 2);
      context.fillStyle = palette.primary;
      context.beginPath();
      context.moveTo(0, -5 * scale);
      context.lineTo(-3.6 * scale, 4 * scale);
      context.lineTo(3.6 * scale, 4 * scale);
      context.closePath();
      context.fill();
      context.restore();

      if (current.protect > 0) {
        context.strokeStyle = withAlpha(palette.primary, 0.55);
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(X(ship.x), Y(ship.y), 7 * scale, 0, Math.PI * 2);
        context.stroke();
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
    session.commit({ score: current.score, level: current.level, resources: 0 });
  };

  const killShip = (current: RockState) => {
    current.lives -= 1;
    current.ship = { x: WORLD / 2, y: WORLD / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
    current.protect = PROTECT_TIME;
    current.bullets = [];
  };

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      const held = session.held;
      const ship = current.ship;

      if (held.has("left")) ship.angle -= TURN_SPEED * dt;
      if (held.has("right")) ship.angle += TURN_SPEED * dt;
      if (held.has("up")) {
        ship.vx += Math.cos(ship.angle) * THRUST * dt;
        ship.vy += Math.sin(ship.angle) * THRUST * dt;
      }
      const damp = Math.max(0, 1 - DRAG * dt);
      ship.vx *= damp;
      ship.vy *= damp;
      ship.x = wrap(ship.x + ship.vx * dt);
      ship.y = wrap(ship.y + ship.vy * dt);

      current.fireTimer += dt;
      current.hyperTimer += dt;
      current.protect = Math.max(0, current.protect - dt);

      for (const bullet of current.bullets) {
        bullet.x = wrap(bullet.x + bullet.vx * dt);
        bullet.y = wrap(bullet.y + bullet.vy * dt);
        bullet.life -= dt;
      }
      current.bullets = current.bullets.filter((b) => b.life > 0);

      for (const rock of current.rocks) {
        rock.x = wrap(rock.x + rock.vx * dt);
        rock.y = wrap(rock.y + rock.vy * dt);
        rock.angle += rock.spin * dt;
      }

      // Bullets shatter rocks, which split downward until dust.
      const deadRocks = new Set<Rock>();
      const splits: Rock[] = [];
      for (const bullet of current.bullets) {
        if (bullet.life <= 0) continue;
        for (const rock of current.rocks) {
          if (deadRocks.has(rock)) continue;
          if (Math.hypot(bullet.x - rock.x, bullet.y - rock.y) >= (ROCK_RADIUS[rock.size] ?? 0) + 1) continue;
          bullet.life = 0;
          deadRocks.add(rock);
          current.score += ROCK_SCORE[rock.size] ?? 0;
          if (rock.size > 1) {
            const next = (rock.size - 1) as 1 | 2;
            for (let i = 0; i < 2; i += 1) {
              const angle = Math.random() * Math.PI * 2;
              const speed = rockSpeed(current.level);
              splits.push({
                x: rock.x,
                y: rock.y,
                vx: rock.vx * 0.4 + Math.cos(angle) * speed,
                vy: rock.vy * 0.4 + Math.sin(angle) * speed,
                size: next,
                spin: (Math.random() - 0.5) * 2,
                angle: 0,
                verts: Array.from({ length: 9 }, () => 0.75 + Math.random() * 0.5),
              });
            }
          }
          break;
        }
      }
      if (deadRocks.size > 0) current.rocks = current.rocks.filter((rock) => !deadRocks.has(rock)).concat(splits);
      current.bullets = current.bullets.filter((b) => b.life > 0);

      if (current.protect <= 0) {
        for (const rock of current.rocks) {
          if (Math.hypot(ship.x - rock.x, ship.y - rock.y) < (ROCK_RADIUS[rock.size] ?? 0) + 2.5) {
            killShip(current);
            break;
          }
        }
      }

      if (current.lives <= 0) {
        sync();
        session.end({ score: current.score, level: current.level, resources: 0 });
        redraw();
        return;
      }
      if (current.rocks.length === 0) {
        current.level += 1;
        current.rocks = startWave(current.level, ship.x, ship.y);
        current.protect = Math.max(current.protect, 1);
      }
      sync();
      redraw();
    },
    { hz: 60 },
  );

  const onEvent = useCallback(
    (event: GameEvent) => {
      if (event.kind !== "action" || event.repeat) return;
      const current = state.current;
      if (event.id === "primary") {
        if (current.fireTimer >= FIRE_COOLDOWN && current.bullets.length < 8) {
          current.fireTimer = 0;
          const ship = current.ship;
          current.bullets.push({
            x: ship.x + Math.cos(ship.angle) * 5,
            y: ship.y + Math.sin(ship.angle) * 5,
            vx: ship.vx + Math.cos(ship.angle) * BULLET_SPEED,
            vy: ship.vy + Math.sin(ship.angle) * BULLET_SPEED,
            life: BULLET_LIFE,
          });
        }
      } else if (event.id === "secondary") {
        // Hyperspace: anywhere else, instantly, then a long wait.
        if (current.hyperTimer >= HYPER_COOLDOWN) {
          current.hyperTimer = 0;
          current.ship.x = Math.random() * WORLD;
          current.ship.y = Math.random() * WORLD;
          current.ship.vx = 0;
          current.ship.vy = 0;
          current.protect = Math.max(current.protect, 1);
        }
      }
    },
    [],
  );

  // Plain array, not a memo, so no dep array can lie about ref reads.
  const readouts = [
    { labelKey: "game.lives" as const, value: state.current.lives },
    { labelKey: "game.level" as const, value: session.run.level ?? 1 },
  ];

  // Announced on a level change only — a running commentary would talk over a
  // screen-reader user for the whole run.
  const announcement = (session.run.level ?? 1) > 1 ? `${t("game.level")} ${session.run.level}` : undefined;

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} announcement={announcement} onEvent={onEvent}>
      <canvas ref={canvasRef} className="game-canvas" />
    </GameShell>
  );
}
