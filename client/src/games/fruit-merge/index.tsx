/**
 * Fruit Merge — drop fruit into the jar, merge matching pairs upward.
 *
 * Owns only its rules: aim with keys or a dragged finger, a drop cooldown,
 * gravity with wall and floor bounces, positional circle resolution, contact
 * merges into the next tier, and an overflow line that ends the run when a
 * resting fruit lingers above it. Tiers grow in size first and hue second,
 * so progress reads without colour. The next fruit is always announced in
 * the readouts.
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
  actions: ["left", "right", "primary"],
  surface: "canvas",
  dpad: "horizontal",
  held: ["left", "right"],
  pointer: "drag",
};

const WORLD_W = 100;
const WORLD_H = 130;
const WALL = 6;
const FLOOR_Y = 122;
const DROP_Y = 12;
const OVERFLOW_Y = 26;
const GRAVITY = 130;
const DROP_COOLDOWN = 0.7;
const AIM_SPEED = 55;

/** Radius, points and hue per tier. Size carries the tier; hue repeats it. Read-only. */
const TIERS = [
  { r: 4, points: 10, hue: 4 },
  { r: 5.5, points: 25, hue: 28 },
  { r: 7, points: 50, hue: 48 },
  { r: 9, points: 100, hue: 140 },
  { r: 11, points: 200, hue: 212 },
  { r: 13.5, points: 400, hue: 280 },
] as const;
const MAX_TIER = TIERS.length - 1;

type Tier = (typeof TIERS)[number];

/**
 * Clamped tier lookup. `next` is dealt 0–2 and merges stop at MAX_TIER, so the
 * clamp never fires on reachable input — it exists because tier numbers arrive
 * as plain `number`s and the type system cannot see the invariant.
 */
const tierAt = (tier: number): Tier => TIERS[Math.min(MAX_TIER, Math.max(0, tier))] ?? TIERS[0] as Tier;

type Fruit = { x: number; y: number; vx: number; vy: number; tier: number; id: number };

type MergeState = {
  fruits: Fruit[];
  aimX: number;
  next: number;
  dropTimer: number;
  overTimer: number;
  score: number;
  top: number;
  seq: number;
};

const startState = (): MergeState => ({
  fruits: [],
  aimX: WORLD_W / 2,
  next: Math.floor(Math.random() * 3),
  dropTimer: DROP_COOLDOWN,
  overTimer: 0,
  score: 0,
  top: 0,
  seq: 1,
});

export default function FruitMerge({ slug, title }: GameModuleProps) {
  const palette = useGamePalette();
  const state = useRef<MergeState>(startState());
  const lastSync = useRef({ score: -1, top: -1, next: -1 });

  const session = useGameSession({
    slug,
    onRestart: () => {
      state.current = startState();
      lastSync.current = { score: -1, top: -1, next: -1 };
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

      context.strokeStyle = palette.borderStrong;
      context.lineWidth = Math.max(2, scale * 0.8);
      context.beginPath();
      context.moveTo(X(WALL), Y(DROP_Y));
      context.lineTo(X(WALL), Y(FLOOR_Y));
      context.lineTo(X(WORLD_W - WALL), Y(FLOOR_Y));
      context.lineTo(X(WORLD_W - WALL), Y(DROP_Y));
      context.stroke();

      context.setLineDash([4, 4]);
      context.strokeStyle = withAlpha(palette.danger, 0.7);
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(X(WALL), Y(OVERFLOW_Y) + 0.5);
      context.lineTo(X(WORLD_W - WALL), Y(OVERFLOW_Y) + 0.5);
      context.stroke();
      context.setLineDash([]);

      // The held fruit hangs at the aim position: what you see is next.
      const held = tierAt(current.next);
      context.fillStyle = `hsl(${held.hue}, 70%, 55%)`;
      context.beginPath();
      context.arc(X(current.aimX), Y(DROP_Y), held.r * scale, 0, Math.PI * 2);
      context.fill();

      for (const fruit of current.fruits) {
        const tier = tierAt(fruit.tier);
        context.fillStyle = `hsl(${tier.hue}, 70%, 55%)`;
        context.beginPath();
        context.arc(X(fruit.x), Y(fruit.y), tier.r * scale, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = withAlpha("#ffffff", 0.5);
        context.beginPath();
        context.arc(X(fruit.x) - tier.r * scale * 0.3, Y(fruit.y) - tier.r * scale * 0.3, Math.max(1, tier.r * scale * 0.22), 0, Math.PI * 2);
        context.fill();
      }
    },
    [palette],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: WORLD_W / WORLD_H, maxHeight: 560, draw, repaintKey: session.repaintKey });

  const sync = () => {
    const current = state.current;
    const last = lastSync.current;
    // `next` is included so the preview readout refreshes on every drop.
    if (last.score === current.score && last.top === current.top && last.next === current.next) return;
    lastSync.current = { score: current.score, top: current.top, next: current.next };
    session.commit({ score: current.score, level: 1, resources: current.top });
  };

  const drop = () => {
    const current = state.current;
    if (current.dropTimer < DROP_COOLDOWN) return;
    current.dropTimer = 0;
    current.fruits.push({ x: current.aimX, y: DROP_Y + tierAt(current.next).r + 1, vx: 0, vy: 0, tier: current.next, id: current.seq });
    current.seq += 1;
    current.next = Math.floor(Math.random() * 3);
  };

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      current.aimX = Math.min(
        WORLD_W - WALL - 4,
        Math.max(WALL + 4, current.aimX + session.held.axisX() * AIM_SPEED * dt),
      );
      current.dropTimer += dt;

      for (const fruit of current.fruits) {
        fruit.vy += GRAVITY * dt;
        fruit.x += fruit.vx * dt;
        fruit.y += fruit.vy * dt;
        const r = tierAt(fruit.tier).r;
        if (fruit.x - r < WALL) {
          fruit.x = WALL + r;
          fruit.vx = Math.abs(fruit.vx) * 0.3;
        }
        if (fruit.x + r > WORLD_W - WALL) {
          fruit.x = WORLD_W - WALL - r;
          fruit.vx = -Math.abs(fruit.vx) * 0.3;
        }
        if (fruit.y + r > FLOOR_Y) {
          fruit.y = FLOOR_Y - r;
          fruit.vy = -Math.abs(fruit.vy) * 0.25;
          fruit.vx *= 0.9;
        }
        fruit.vx *= Math.max(0, 1 - 0.4 * dt);
      }

      // Pairwise resolution, then contact merges upward.
      const merged = new Set<number>();
      for (let i = 0; i < current.fruits.length; i += 1) {
        for (let j = i + 1; j < current.fruits.length; j += 1) {
          const a = current.fruits[i];
          const b = current.fruits[j];
          // Loop-bounded, so always defined; the guard below is type-level only.
          if (!a || !b) continue;
          if (merged.has(a.id) || merged.has(b.id)) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const minDist = tierAt(a.tier).r + tierAt(b.tier).r;
          if (dist >= minDist || dist === 0) continue;
          if (a.tier === b.tier && a.tier < MAX_TIER) {
            merged.add(a.id);
            merged.add(b.id);
            current.score += tierAt(a.tier).points;
            current.top = Math.max(current.top, a.tier + 1);
            current.fruits.push({
              x: (a.x + b.x) / 2,
              y: (a.y + b.y) / 2,
              vx: (a.vx + b.vx) / 2,
              vy: Math.min(a.vy, b.vy) - 8,
              tier: a.tier + 1,
              id: current.seq,
            });
            current.seq += 1;
          } else {
            const push = ((minDist - dist) / 2) * 0.8;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
          }
        }
      }
      if (merged.size > 0) current.fruits = current.fruits.filter((f) => !merged.has(f.id));

      // Overflow: a near-motionless fruit lingering above the dashed line.
      const resting = current.fruits.some((f) => f.y - tierAt(f.tier).r < OVERFLOW_Y && Math.hypot(f.vx, f.vy) < 6);
      current.overTimer = resting ? current.overTimer + dt : 0;
      if (current.overTimer > 2) {
        sync();
        session.end({ score: current.score, level: 1, resources: current.top });
        redraw();
        return;
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
      drop();
      return;
    }
    if (event.kind !== "point") return;
    current.aimX = Math.min(WORLD_W - WALL - 4, Math.max(WALL + 4, event.x * WORLD_W));
    // Release commits the drop: drag to aim, let go to let go.
    if (event.phase === "end") drop();
  });

  // Both readouts are tier numbers starting at one: what hangs next, and
  // the biggest merge so far. They re-render on every scored commit: plain
  // array, not a memo, so no dep array can lie about ref reads.
  const readouts = [
    { labelKey: "game.next" as const, value: state.current.next + 1 },
    { labelKey: "game.tile" as const, value: state.current.top + 1 },
  ];

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <canvas ref={canvasRef} className="game-canvas" />
    </GameShell>
  );
}
