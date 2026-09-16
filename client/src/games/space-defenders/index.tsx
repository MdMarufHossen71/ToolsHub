/**
 * Space Defenders — hold the line against descending waves, on canvas.
 *
 * Owns only its rules: a gliding gun, cooldown-gated fire, one bomb per wave
 * that clears the sky, descending invaders that shoot back, and waves that
 * quicken. Movement samples held keys in the tick; fire and bomb are discrete
 * action events, so OS auto-repeat and touch taps funnel through the same
 * cooldown. Lives, wave, and bombs persist through the session.
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
import { useTranslation } from "@/contexts/AppSettingsContext";

const SPEC: ControlSpec = {
  actions: ["left", "right", "primary", "secondary"],
  surface: "canvas",
  dpad: "horizontal",
  held: ["left", "right"],
};

const WORLD_W = 100;
const WORLD_H = 120;
const PLAYER_Y = 108;
const PLAYER_HALF = 4;
const FIRE_COOLDOWN = 0.22;
const BULLET_SPEED = 90;
const ENEMY_BULLET_SPEED = 45;
const INVADER_COLS = 6;
const INVADER_ROWS = 3;

type Bullet = { x: number; y: number; enemy: boolean };
type Invader = { x: number; y: number; alive: boolean };

type DefenderState = {
  playerX: number;
  bullets: Bullet[];
  invaders: Invader[];
  direction: 1 | -1;
  invaderTimer: number;
  fireTimer: number;
  enemyTimer: number;
  bombs: number;
  lives: number;
  score: number;
  wave: number;
};

const buildWave = (): Invader[] => {
  const out: Invader[] = [];
  for (let r = 0; r < INVADER_ROWS; r += 1) {
    for (let c = 0; c < INVADER_COLS; c += 1) {
      out.push({ x: 14 + c * 12, y: 14 + r * 10, alive: true });
    }
  }
  return out;
};

const startState = (): DefenderState => ({
  playerX: WORLD_W / 2,
  bullets: [],
  invaders: buildWave(),
  direction: 1,
  invaderTimer: 0,
  fireTimer: FIRE_COOLDOWN,
  enemyTimer: 1.5,
  bombs: 3,
  lives: 3,
  score: 0,
  wave: 1,
});

export default function SpaceDefenders({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const palette = useGamePalette();
  const state = useRef<DefenderState>(startState());
  // Last values already reported. `commit` re-renders, so calling it sixty
  // times a second would animate React instead of the canvas — report only
  // when something actually changed. (Snake commits on eats for the same
  // reason; a shooter just has more reasons.)
  const lastSync = useRef({ score: -1, wave: -1, bombs: -1, lives: -1 });

  const session = useGameSession({
    slug,
    onRestart: () => {
      state.current = startState();
      lastSync.current = { score: -1, wave: -1, bombs: -1, lives: -1 };
    },
  });

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

      for (const bullet of current.bullets) {
        context.fillStyle = bullet.enemy ? palette.danger : palette.primary;
        context.fillRect(X(bullet.x) - scale, Y(bullet.y) - 3 * scale, 2 * scale, 3 * scale);
      }

      for (const invader of current.invaders) {
        if (!invader.alive) continue;
        context.fillStyle = withAlpha(palette.danger, 0.85);
        context.fillRect(X(invader.x) - 3 * scale, Y(invader.y) - 2.5 * scale, 6 * scale, 5 * scale);
        context.fillStyle = palette.sunken;
        context.fillRect(X(invader.x) - scale, Y(invader.y) - scale, 2 * scale, 2 * scale);
      }

      // The gun is a triangle; everything hostile is square. Shape, not colour.
      context.fillStyle = palette.primary;
      context.beginPath();
      context.moveTo(X(current.playerX), Y(PLAYER_Y) - PLAYER_HALF * scale);
      context.lineTo(X(current.playerX) - PLAYER_HALF * scale, Y(PLAYER_Y) + PLAYER_HALF * scale);
      context.lineTo(X(current.playerX) + PLAYER_HALF * scale, Y(PLAYER_Y) + PLAYER_HALF * scale);
      context.closePath();
      context.fill();
    },
    [palette],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: WORLD_W / WORLD_H, maxHeight: 560, draw, repaintKey: session.repaintKey });

  const sync = () => {
    const current = state.current;
    const last = lastSync.current;
    if (last.score === current.score && last.wave === current.wave && last.bombs === current.bombs && last.lives === current.lives) return;
    lastSync.current = { score: current.score, wave: current.wave, bombs: current.bombs, lives: current.lives };
    session.commit({ score: current.score, level: current.wave, resources: current.bombs });
  };

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      current.playerX = Math.min(
        WORLD_W - PLAYER_HALF,
        Math.max(PLAYER_HALF, current.playerX + session.held.axisX() * 62 * dt),
      );
      current.fireTimer += dt;

      for (const bullet of current.bullets) {
        bullet.y += (bullet.enemy ? ENEMY_BULLET_SPEED : -BULLET_SPEED) * dt;
      }
      current.bullets = current.bullets.filter((b) => b.y > 0 && b.y < WORLD_H);

      // Invaders drift sideways and drop a rank at each edge. Faster per wave.
      current.invaderTimer += dt;
      const stepEvery = Math.max(0.18, 0.55 - (current.wave - 1) * 0.06);
      if (current.invaderTimer >= stepEvery) {
        current.invaderTimer = 0;
        let edge = false;
        for (const invader of current.invaders) {
          if (!invader.alive) continue;
          invader.x += current.direction * 2.5;
          if (invader.x < 8 || invader.x > WORLD_W - 8) edge = true;
        }
        if (edge) {
          current.direction = current.direction === 1 ? -1 : 1;
          for (const invader of current.invaders) invader.y += 4;
        }
      }

      // A random survivor fires back.
      current.enemyTimer -= dt;
      if (current.enemyTimer <= 0) {
        current.enemyTimer = Math.max(0.5, 1.4 - (current.wave - 1) * 0.12);
        const alive = current.invaders.filter((i) => i.alive);
        if (alive.length > 0) {
          const shooter = alive[Math.floor(Math.random() * alive.length)];
          // Non-empty by the length check; the guard is type-level only.
          if (shooter) current.bullets.push({ x: shooter.x, y: shooter.y + 3, enemy: true });
        }
      }

      // Player bullets against invaders.
      for (const bullet of current.bullets) {
        if (bullet.enemy) continue;
        for (const invader of current.invaders) {
          if (!invader.alive) continue;
          if (Math.abs(bullet.x - invader.x) < 3.5 && Math.abs(bullet.y - invader.y) < 3) {
            invader.alive = false;
            bullet.y = -10;
            current.score += 10 * current.wave;
          }
        }
      }
      current.bullets = current.bullets.filter((b) => b.y > 0);

      // Enemy bullets against the gun.
      for (const bullet of current.bullets) {
        if (!bullet.enemy) continue;
        if (Math.abs(bullet.x - current.playerX) < PLAYER_HALF && Math.abs(bullet.y - PLAYER_Y) < PLAYER_HALF) {
          bullet.y = WORLD_H + 10;
          current.lives -= 1;
        }
      }

      // The line breaks through: lose a life and push the wave back up.
      const breach = current.invaders.some((i) => i.alive && i.y >= PLAYER_Y - 6);
      if (breach) {
        current.lives -= 1;
        for (const invader of current.invaders) invader.y = Math.max(10, invader.y - 30);
      }

      if (current.lives <= 0) {
        sync();
        session.end({ score: current.score, level: current.wave, resources: current.bombs });
        redraw();
        return;
      }

      if (current.invaders.every((i) => !i.alive)) {
        current.wave += 1;
        current.invaders = buildWave();
        current.bombs = Math.min(3, current.bombs + 1);
      }
      sync();
      redraw();
    },
    { hz: 60 },
  );

  // Stable identity with latest-closure semantics (same ref-mirror idiom as the
  // engine's own `eventRef`): the body only touches refs and module constants.
  const onEvent = usePersistFn((event: GameEvent) => {
    if (event.kind !== "action") return;
    const current = state.current;
    if (event.id === "primary" && !event.repeat) {
      if (current.fireTimer >= FIRE_COOLDOWN) {
        current.fireTimer = 0;
        current.bullets.push({ x: current.playerX, y: PLAYER_Y - 5, enemy: false });
      }
    } else if (event.id === "secondary" && !event.repeat) {
      // One bomb clears the sky. Scarce on purpose: three per run, one back
      // per wave, so it stays an escape hatch rather than the whole game.
      if (current.bombs > 0) {
        current.bombs -= 1;
        for (const invader of current.invaders) {
          if (invader.alive) {
            invader.alive = false;
            current.score += 5 * current.wave;
          }
        }
        current.bullets = current.bullets.filter((b) => !b.enemy);
        sync();
        redraw();
      }
    }
  });

  // Lives and bombs live in the loop ref; the change-checked `sync` above
  // re-renders exactly when they move, so these readouts stay fresh without
  // rendering sixty times a second. Plain array, not a memo.
  const readouts = [
    { labelKey: "game.lives" as const, value: state.current.lives },
    { labelKey: "game.level" as const, value: session.run.level ?? 1 },
    { labelKey: "game.resources" as const, value: session.run.resources ?? 3 },
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
