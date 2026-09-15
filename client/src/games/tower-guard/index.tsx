/**
 * Tower Guard — stop every wave along a fixed road, full strategy game.
 *
 * Owns only its rules: an S-road with rasterized buildable cells, three
 * tower kinds (swift arrows, splashing cannon, slowing frost) with three
 * levels each, compounding costs with a 70% sell-back, scaling waves with
 * runners, grunts and tanks, and leak damage against twenty lives. The board
 * is canvas; the shop is plain DOM buttons beside it, so touch taps and Tab
 * reach everything the arrow-key cursor does: move the ghost, Enter builds
 * or selects, F upgrades, Backspace sells.
 */
import { useCallback, useMemo, useRef, useState } from "react";
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

const SPEC: ControlSpec = {
  actions: ["up", "down", "left", "right", "primary", "secondary", "erase"],
  surface: "canvas",
  dpad: "four",
};

const COLS = 16;
const ROWS = 12;
const START_COINS = 140;
const START_LIVES = 20;
const SELL_RATE = 0.7;
const MAX_LEVEL = 3;

type TowerKind = "arrow" | "cannon" | "frost";

const TOWERS: Record<TowerKind, { cost: number; damage: number; rate: number; range: number; splash: number; slow: number }> = {
  arrow: { cost: 50, damage: 9, rate: 1.8, range: 3.0, splash: 0, slow: 0 },
  cannon: { cost: 110, damage: 26, rate: 0.65, range: 2.6, splash: 1.3, slow: 0 },
  frost: { cost: 80, damage: 4, rate: 1.1, range: 2.6, splash: 0, slow: 0.5 },
};

const WAYPOINTS = [
  { x: -1, y: 2 },
  { x: 12, y: 2 },
  { x: 12, y: 9 },
  { x: 3, y: 9 },
  { x: 3, y: ROWS },
];

export type Waypoint = { x: number; y: number };

/** Every cell the road touches. Pure. */
export function pathCells(waypoints: Waypoint[] = WAYPOINTS): Set<number> {
  const cells = new Set<number>();
  for (let s = 0; s < waypoints.length - 1; s += 1) {
    const a = waypoints[s];
    const b = waypoints[s + 1];
    // Loop-bounded, so both ends exist; the guard below is type-level only.
    if (!a || !b) continue;
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let i = 0; i <= steps; i += 1) {
      const x = Math.round(a.x + ((b.x - a.x) * i) / steps);
      const y = Math.round(a.y + ((b.y - a.y) * i) / steps);
      if (x >= 0 && x < COLS && y >= 0 && y < ROWS) cells.add(y * COLS + x);
    }
  }
  return cells;
}

/** Segment lengths and total road length. Pure. */
export function roadLengths(waypoints: Waypoint[] = WAYPOINTS): { segments: number[]; total: number } {
  const segments = [];
  for (let s = 0; s < waypoints.length - 1; s += 1) {
    const a = waypoints[s];
    const b = waypoints[s + 1];
    if (!a || !b) continue;
    segments.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  return { segments, total: segments.reduce((a, b) => a + b, 0) };
}

/** Position at a travelled distance along the road. Pure. */
export function positionAt(distance: number, waypoints: Waypoint[] = WAYPOINTS): { x: number; y: number; done: boolean } {
  let remaining = distance;
  for (let s = 0; s < waypoints.length - 1; s += 1) {
    const a = waypoints[s];
    const b = waypoints[s + 1];
    if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length) {
      const t = length === 0 ? 0 : remaining / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, done: false };
    }
    remaining -= length;
  }
  // An empty waypoint list has no road: report the origin as done rather than
  // throwing on the missing last point.
  const last = waypoints[waypoints.length - 1];
  if (!last) return { x: 0, y: 0, done: true };
  return { x: last.x, y: last.y, done: true };
}

/** Upgrade price for the next level. Pure. */
export function upgradeCost(kind: TowerKind, level: number): number {
  return Math.floor(TOWERS[kind].cost * Math.pow(1.8, level));
}

export type EnemyKind = "runner" | "grunt" | "tank";
type Enemy = { kind: EnemyKind; dist: number; hp: number; maxHp: number; speed: number; reward: number; damage: number; slowUntil: number; x: number; y: number };

/** Wave composition: more bodies, tougher skin, faster drip. Pure. */
export function waveComp(wave: number): Array<{ kind: EnemyKind; delay: number }> {
  const count = 5 + wave * 2;
  const comp: Array<{ kind: EnemyKind; delay: number }> = [];
  for (let i = 0; i < count; i += 1) {
    let kind: EnemyKind = "grunt";
    if (wave >= 3 && i % 4 === 3) kind = "tank";
    else if (wave >= 2 && i % 3 === 2) kind = "runner";
    comp.push({ kind, delay: i === 0 ? 0.5 : Math.max(0.35, 0.95 - wave * 0.05) });
  }
  return comp;
}

const ENEMY_STATS: Record<EnemyKind, { hp: number; speed: number; reward: number; damage: number }> = {
  runner: { hp: 26, speed: 3.2, reward: 7, damage: 1 },
  grunt: { hp: 55, speed: 2.1, reward: 9, damage: 1 },
  tank: { hp: 160, speed: 1.3, reward: 22, damage: 2 },
};

type Tower = { x: number; y: number; kind: TowerKind; level: number; invested: number; cooldown: number };
type Tracer = { x1: number; y1: number; x2: number; y2: number; ttl: number; frost: boolean };

type GuardState = {
  towers: Tower[];
  enemies: Enemy[];
  tracers: Tracer[];
  queue: Array<{ kind: EnemyKind; delay: number }>;
  spawnTimer: number;
  wave: number;
  waveActive: boolean;
  coins: number;
  lives: number;
  kills: number;
  score: number;
  cursor: { x: number; y: number };
  shopKind: TowerKind;
  selected: number;
};

const startState = (): GuardState => ({
  towers: [],
  enemies: [],
  tracers: [],
  queue: [],
  spawnTimer: 0,
  wave: 1,
  waveActive: false,
  coins: START_COINS,
  lives: START_LIVES,
  kills: 0,
  score: 0,
  cursor: { x: 7, y: 5 },
  shopKind: "arrow",
  selected: -1,
});

export default function TowerGuard({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const palette = useGamePalette();
  const state = useRef<GuardState>(startState());
  const [panel, setPanel] = useState(0);
  const lastSync = useRef({ score: -1, wave: -1, lives: -1, coins: -1 });
  const road = useMemo(() => ({ cells: pathCells(), ...roadLengths() }), []);

  const session = useGameSession({
    slug,
    onRestart: () => {
      state.current = startState();
      lastSync.current = { score: -1, wave: -1, lives: -1, coins: -1 };
      setPanel((p) => p + 1);
    },
  });

  const refresh = () => setPanel((p) => p + 1);

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const current = state.current;
      const board = Math.min(size.width, (size.height * COLS) / ROWS);
      const cell = board / COLS;
      const offsetX = (size.width - board) / 2;
      const offsetY = (size.height - (board * ROWS) / COLS) / 2;
      context.clearRect(0, 0, size.width, size.height);
      context.fillStyle = palette.sunken;
      context.fillRect(offsetX, offsetY, board, (board * ROWS) / COLS);

      context.fillStyle = withAlpha(palette.muted, 0.3);
      road.cells.forEach((index) => {
        const x = index % COLS;
        const y = Math.floor(index / COLS);
        context.fillRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
      });

      for (const enemy of current.enemies) {
        const cx = offsetX + (enemy.x + 0.5) * cell;
        const cy = offsetY + (enemy.y + 0.5) * cell;
        const r = cell * (enemy.kind === "tank" ? 0.36 : 0.28);
        context.fillStyle = enemy.kind === "runner" ? palette.accent : palette.danger;
        context.beginPath();
        context.arc(cx, cy, r, 0, Math.PI * 2);
        context.fill();
        // Health bar under every enemy: width is the state, colour is decoration.
        context.fillStyle = withAlpha(palette.text, 0.35);
        context.fillRect(cx - r, cy + r + 1, r * 2, 2);
        context.fillStyle = palette.text;
        context.fillRect(cx - r, cy + r + 1, (r * 2 * Math.max(0, enemy.hp)) / enemy.maxHp, 2);
      }

      current.towers.forEach((tower, i) => {
        const cx = offsetX + (tower.x + 0.5) * cell;
        const cy = offsetY + (tower.y + 0.5) * cell;
        const s = cell * 0.3;
        context.fillStyle = palette.primary;
        context.beginPath();
        if (tower.kind === "arrow") {
          context.moveTo(cx, cy - s);
          context.lineTo(cx - s, cy + s);
          context.lineTo(cx + s, cy + s);
        } else if (tower.kind === "cannon") {
          context.rect(cx - s, cy - s, s * 2, s * 2);
        } else {
          context.moveTo(cx, cy - s);
          context.lineTo(cx + s, cy);
          context.lineTo(cx, cy + s);
          context.lineTo(cx - s, cy);
        }
        context.fill();
        if (i === current.selected) {
          context.strokeStyle = palette.primary;
          context.lineWidth = 2;
          context.strokeRect(cx - cell / 2, cy - cell / 2, cell, cell);
          const stats = TOWERS[tower.kind];
          context.setLineDash([4, 4]);
          context.beginPath();
          context.arc(cx, cy, stats.range * cell, 0, Math.PI * 2);
          context.stroke();
          context.setLineDash([]);
        }
        context.fillStyle = palette.onPrimary;
        for (let p = 0; p < tower.level; p += 1) {
          context.fillRect(cx - s + p * 4, cy + s + 2, 3, 2);
        }
      });

      for (const tracer of current.tracers) {
        context.strokeStyle = tracer.frost ? withAlpha(palette.accent, 0.8) : withAlpha(palette.primary, 0.8);
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(offsetX + (tracer.x1 + 0.5) * cell, offsetY + (tracer.y1 + 0.5) * cell);
        context.lineTo(offsetX + (tracer.x2 + 0.5) * cell, offsetY + (tracer.y2 + 0.5) * cell);
        context.stroke();
      }

      // Ghost cursor with the selected shop kind previewed inside.
      const gx = offsetX + (current.cursor.x + 0.5) * cell;
      const gy = offsetY + (current.cursor.y + 0.5) * cell;
      context.strokeStyle = palette.text;
      context.lineWidth = 1.5;
      context.strokeRect(gx - cell / 2, gy - cell / 2, cell, cell);
    },
    [palette, road.cells],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: COLS / ROWS, maxHeight: 460, draw, repaintKey: `${session.repaintKey}:${panel}` });

  const sync = () => {
    const current = state.current;
    const last = lastSync.current;
    if (last.score === current.score && last.wave === current.wave && last.lives === current.lives && last.coins === Math.floor(current.coins)) return;
    lastSync.current = { score: current.score, wave: current.wave, lives: current.lives, coins: Math.floor(current.coins) };
    session.commit({ score: current.score, level: current.wave, resources: Math.floor(current.coins) });
  };

  const startWave = () => {
    const current = state.current;
    if (session.phase !== "playing" || current.waveActive) return;
    current.queue = waveComp(current.wave);
    current.spawnTimer = 0;
    current.waveActive = true;
    refresh();
  };

  const buildAt = (x: number, y: number) => {
    const current = state.current;
    if (session.phase !== "playing") return;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS || road.cells.has(y * COLS + x)) return;
    const existing = current.towers.findIndex((t) => t.x === x && t.y === y);
    if (existing >= 0) {
      current.selected = existing;
      refresh();
      return;
    }
    const stats = TOWERS[current.shopKind];
    if (current.coins < stats.cost) return;
    current.coins -= stats.cost;
    current.towers.push({ x, y, kind: current.shopKind, level: 1, invested: stats.cost, cooldown: 0 });
    current.selected = current.towers.length - 1;
    sync();
    refresh();
    redraw();
  };

  const upgradeSelected = () => {
    const current = state.current;
    if (session.phase !== "playing") return;
    const tower = current.towers[current.selected];
    if (!tower || tower.level >= MAX_LEVEL) return;
    const price = upgradeCost(tower.kind, tower.level);
    if (current.coins < price) return;
    current.coins -= price;
    tower.invested += price;
    tower.level += 1;
    sync();
    refresh();
  };

  const sellSelected = () => {
    const current = state.current;
    if (session.phase !== "playing") return;
    const tower = current.towers[current.selected];
    if (!tower) return;
    current.coins += Math.floor(tower.invested * SELL_RATE);
    current.towers.splice(current.selected, 1);
    current.selected = -1;
    sync();
    refresh();
    redraw();
  };

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      const step = Math.min(dt, 0.05);
      const now = performance.now() / 1000;

      if (current.waveActive && current.queue.length > 0) {
        current.spawnTimer -= step;
        if (current.spawnTimer <= 0) {
          const next = current.queue.shift();
          if (next) {
            const stats = ENEMY_STATS[next.kind];
            const scale = Math.pow(1.16, current.wave - 1);
            const pos = positionAt(0);
            current.enemies.push({
              kind: next.kind,
              dist: 0,
              hp: stats.hp * scale,
              maxHp: stats.hp * scale,
              speed: stats.speed * Math.min(1.6, 1 + (current.wave - 1) * 0.04),
              reward: stats.reward,
              damage: stats.damage,
              slowUntil: 0,
              x: pos.x,
              y: pos.y,
            });
            current.spawnTimer = next.delay;
          }
        }
      }

      for (const tower of current.towers) {
        tower.cooldown -= step;
        if (tower.cooldown > 0) continue;
        const stats = TOWERS[tower.kind];
        const damage = stats.damage * Math.pow(1.65, tower.level - 1);
        let best: Enemy | null = null;
        for (const enemy of current.enemies) {
          const d = Math.hypot(enemy.x - (tower.x + 0.5), enemy.y - (tower.y + 0.5));
          if (d > stats.range) continue;
          if (!best || enemy.dist > best.dist) best = enemy;
        }
        if (!best) continue;
        tower.cooldown = 1 / (stats.rate * (1 + (tower.level - 1) * 0.15));
        if (stats.splash > 0) {
          for (const enemy of current.enemies) {
            if (Math.hypot(enemy.x - best.x, enemy.y - best.y) <= stats.splash) enemy.hp -= damage;
          }
        } else {
          best.hp -= damage;
        }
        if (stats.slow > 0) best.slowUntil = now + 2;
        current.tracers.push({ x1: tower.x, y1: tower.y, x2: best.x, y2: best.y, ttl: 0.12, frost: stats.slow > 0 });
      }
      current.tracers = current.tracers.filter((t) => (t.ttl -= step) > 0);

      const survivors: Enemy[] = [];
      for (const enemy of current.enemies) {
        if (enemy.hp <= 0) {
          current.kills += 1;
          current.score += 10;
          current.coins += enemy.reward;
          continue;
        }
        const slowed = enemy.slowUntil > now;
        enemy.dist += enemy.speed * (slowed ? 0.5 : 1) * step;
        const pos = positionAt(enemy.dist);
        enemy.x = pos.x;
        enemy.y = pos.y;
        if (pos.done) {
          current.lives -= enemy.damage;
        } else {
          survivors.push(enemy);
        }
      }
      current.enemies = survivors;

      if (current.waveActive && current.queue.length === 0 && current.enemies.length === 0) {
        current.waveActive = false;
        current.coins += 30 + current.wave * 10;
        current.score += 50;
        current.wave += 1;
        refresh();
      }

      if (current.lives <= 0) {
        current.lives = 0;
        sync();
        session.end({ score: current.score, level: current.wave, resources: Math.floor(current.coins) });
        redraw();
        return;
      }
      sync();
      redraw();
    },
    { hz: 60 },
  );

  const moveCursor = (dx: number, dy: number) => {
    const current = state.current;
    current.cursor.x = Math.min(COLS - 1, Math.max(0, current.cursor.x + dx));
    current.cursor.y = Math.min(ROWS - 1, Math.max(0, current.cursor.y + dy));
    refresh();
    redraw();
  };

  const onEvent = (event: GameEvent) => {
    if (event.kind !== "action") return;
    const current = state.current;
    if (event.id === "up") moveCursor(0, -1);
    else if (event.id === "down") moveCursor(0, 1);
    else if (event.id === "left") moveCursor(-1, 0);
    else if (event.id === "right") moveCursor(1, 0);
    else if (event.id === "primary" && !event.repeat) buildAt(current.cursor.x, current.cursor.y);
    else if (event.id === "secondary" && !event.repeat) upgradeSelected();
    else if (event.id === "erase") sellSelected();
  };

  const selected = state.current.towers[state.current.selected] ?? null;
  const kinds: TowerKind[] = ["arrow", "cannon", "frost"];
  const kindName = (kind: TowerKind) => t(kind === "arrow" ? "game.towerArrow" : kind === "cannon" ? "game.towerCannon" : "game.towerFrost");

  // Plain array, not a memo: these are three cheap reads, and every value that can
  // change them (`panel` included — shop actions that skip commits) already
  // re-renders this component. A dep array here would either lie or need a disable.
  const readouts = [
    { labelKey: "game.lives" as const, value: state.current.lives },
    { labelKey: "game.level" as const, value: session.run.level ?? 1 },
    { labelKey: "game.coins" as const, value: Math.floor(state.current.coins) },
  ];

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <div className="game-full">
        <canvas ref={canvasRef} className="game-canvas" />
        <div className="game-mode-row" role="group" aria-label={title}>
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              className="game-column-pick game-pick-pad"
              data-active={state.current.shopKind === kind}
              aria-pressed={state.current.shopKind === kind}
              onClick={() => {
                state.current.shopKind = kind;
                refresh();
              }}
            >
              {kindName(kind)} · {TOWERS[kind].cost}
            </button>
          ))}
          <button
            type="button"
            className="game-column-pick"
            style={{ padding: "0 14px" }}
            disabled={state.current.waveActive}
            onClick={startWave}
          >
            {t("game.wave", { n: state.current.wave })}
          </button>
          <button
            type="button"
            className="game-column-pick"
            style={{ padding: "0 14px" }}
            disabled={!selected || selected.level >= MAX_LEVEL}
            onClick={upgradeSelected}
            aria-label={t("game.upgradeTower")}
          >
            <span aria-hidden="true">↑{selected ? upgradeCost(selected.kind, selected.level) : ""}</span>
          </button>
          <button
            type="button"
            className="game-column-pick"
            style={{ padding: "0 14px" }}
            disabled={!selected}
            onClick={sellSelected}
            aria-label={t("game.sellTower")}
          >
            <span aria-hidden="true">⌫</span>
          </button>
        </div>
      </div>
    </GameShell>
  );
}
