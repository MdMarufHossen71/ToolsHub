/**
 * Hill Rider — throttle and brake over rolling hills without running dry.
 *
 * Owns only its rules: a pure height function shared by physics and paint
 * (so the wheels never disagree with the drawing), throttle/brake sampled
 * from held keys, crest airtime with gravity, fuel that drains and refills
 * at cans, and distance scoring. The fail state is an empty tank — there is
 * no unfair crash, only planning. Fuel is the resources readout.
 */
import { useCallback, useMemo, useRef } from "react";
import {
  GameShell,
  useGameCanvas,
  useGameLoop,
  useGamePalette,
  useGameSession,
  type CanvasSize,
  type ControlSpec,
} from "@/games/engine";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = {
  actions: ["left", "right", "up", "down"],
  surface: "canvas",
  dpad: "four",
  held: ["left", "right", "up", "down"],
};

const WORLD_H = 60;
const VIEW_W = 120;
const MAX_SPEED = 70;
const ACCEL = 26;
const BRAKE = 46;
const DRAG = 3;
const GRAVITY = 90;
const FUEL_DRAIN = 1.6;
const FUEL_PICKUP = 35;
const CAN_SPACING = 260;

export function terrainHeight(x: number): number {
  return 42 + 8 * Math.sin(x * 0.045) + 4 * Math.sin(x * 0.12 + 1.7) + 1.5 * Math.sin(x * 0.31 + 0.4);
}

export function terrainSlope(x: number): number {
  return (terrainHeight(x + 1) - terrainHeight(x - 1)) / 2;
}

type Can = { x: number; taken: boolean };

type RideState = {
  x: number;
  y: number;
  vy: number;
  speed: number;
  fuel: number;
  cans: Can[];
  nextCan: number;
  distance: number;
  score: number;
  level: number;
};

const startState = (): RideState => ({
  x: 0,
  y: terrainHeight(0),
  vy: 0,
  speed: 0,
  fuel: 100,
  cans: [{ x: 180, taken: false }],
  nextCan: 180 + CAN_SPACING,
  distance: 0,
  score: 0,
  level: 1,
});

export default function HillRider({ slug, title }: GameModuleProps) {
  const palette = useGamePalette();
  const state = useRef<RideState>(startState());
  const lastSync = useRef({ score: -1, level: -1, fuel: -1 });

  const session = useGameSession({
    slug,
    onRestart: () => {
      state.current = startState();
      lastSync.current = { score: -1, level: -1, fuel: -1 };
    },
  });

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const current = state.current;
      const scale = size.height / WORLD_H;
      const viewW = size.width / scale;
      // The camera sits a third from the left so the landing ahead is visible.
      const camX = current.x - viewW / 3;
      const X = (x: number) => (x - camX) * scale;
      const Y = (y: number) => y * scale;

      context.clearRect(0, 0, size.width, size.height);
      context.fillStyle = palette.sunken;
      context.fillRect(0, 0, size.width, size.height);

      context.fillStyle = palette.borderStrong;
      context.beginPath();
      context.moveTo(0, size.height);
      for (let px = 0; px <= size.width + 8; px += 8) {
        context.lineTo(px, Y(terrainHeight(camX + px / scale)));
      }
      context.lineTo(size.width, size.height);
      context.closePath();
      context.fill();

      for (const can of current.cans) {
        if (can.taken) continue;
        const cx = X(can.x);
        if (cx < -20 || cx > size.width + 20) continue;
        context.fillStyle = palette.accent;
        context.fillRect(cx - 3 * scale * 0.4, Y(terrainHeight(can.x)) - 8 * scale * 0.4, 6 * scale * 0.4, 8 * scale * 0.4);
      }

      const bx = X(current.x);
      const by = Y(current.y);
      const slope = terrainSlope(current.x);
      context.save();
      context.translate(bx, by);
      context.rotate(Math.atan(slope) * 0.7);
      context.fillStyle = palette.primary;
      context.fillRect(-5 * scale * 0.4, -4 * scale * 0.4, 10 * scale * 0.4, 3 * scale * 0.4);
      context.fillStyle = palette.text;
      context.beginPath();
      context.arc(-3.4 * scale * 0.4, 0, 1.8 * scale * 0.4, 0, Math.PI * 2);
      context.arc(3.4 * scale * 0.4, 0, 1.8 * scale * 0.4, 0, Math.PI * 2);
      context.fill();
      context.restore();

      // Fuel bar along the top: width is the state, not colour alone.
      const barW = size.width - 24;
      context.fillStyle = palette.sunken;
      context.fillRect(12, 10, barW, 8);
      context.fillStyle = current.fuel < 25 ? palette.danger : palette.primary;
      context.fillRect(12, 10, (barW * Math.max(0, current.fuel)) / 100, 8);
    },
    [palette],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: 2, maxHeight: 420, draw, repaintKey: session.repaintKey });

  const sync = () => {
    const current = state.current;
    const last = lastSync.current;
    const fuel = Math.ceil(current.fuel);
    if (last.score === current.score && last.level === current.level && last.fuel === fuel) return;
    lastSync.current = { score: current.score, level: current.level, fuel };
    session.commit({ score: current.score, level: current.level, resources: fuel });
  };

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      const held = session.held;
      const throttle = held.has("right") || held.has("up");
      const brake = held.has("left") || held.has("down");

      if (throttle) current.speed += ACCEL * dt;
      if (brake) current.speed -= BRAKE * dt;
      current.speed -= current.speed * DRAG * dt * 0.2;
      // Uphill bleeds speed, downhill feeds it.
      current.speed -= terrainSlope(current.x) * 14 * dt;
      current.speed = Math.min(MAX_SPEED, Math.max(0, current.speed));

      current.x += current.speed * dt;
      current.distance = Math.max(current.distance, current.x);
      current.score = Math.floor(current.distance / 10);
      current.level = Math.floor(current.distance / 1000) + 1;

      const ground = terrainHeight(current.x);
      if (current.y >= ground - 0.01) {
        current.y = ground;
        current.vy = 0;
        // Leaving a crest faster than the ground falls away means air.
        if (current.speed * terrainSlope(current.x) < -14) current.vy = -3;
      } else {
        current.vy += GRAVITY * dt;
        current.y += current.vy * dt;
        if (current.y >= ground) {
          current.y = ground;
          current.vy = 0;
        }
      }

      current.fuel -= (FUEL_DRAIN + (throttle ? 1.2 : 0)) * dt;
      for (const can of current.cans) {
        if (!can.taken && Math.abs(can.x - current.x) < 4 && Math.abs(terrainHeight(can.x) - current.y) < 6) {
          can.taken = true;
          current.fuel = Math.min(100, current.fuel + FUEL_PICKUP);
        }
      }
      while (current.nextCan < current.x + VIEW_W) {
        current.cans.push({ x: current.nextCan, taken: false });
        current.nextCan += CAN_SPACING + Math.random() * 120;
      }
      current.cans = current.cans.filter((can) => can.x > current.x - 60);

      if (current.fuel <= 0) {
        current.fuel = 0;
        sync();
        session.end({ score: current.score, level: current.level, resources: 0 });
        redraw();
        return;
      }
      sync();
      redraw();
    },
    { hz: 60 },
  );

  const readouts = useMemo(
    () => [
      { labelKey: "game.level" as const, value: session.run.level ?? 1 },
      { labelKey: "game.resources" as const, value: session.run.resources ?? 100 },
    ],
    [session.run.level, session.run.resources],
  );

  const onEvent = () => undefined;

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <canvas ref={canvasRef} className="game-canvas" />
    </GameShell>
  );
}
