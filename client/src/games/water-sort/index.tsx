/**
 * Water Sort — pour until every tube holds a single colour, no canvas.
 *
 * Owns only its rules: contiguous-group pours into matching-or-empty tubes,
 * a full undo stack, and a solver-checked deal (random fills are verified
 * solvable before play, so no round is ever a dead end). Tubes are buttons
 * in one row: tap source, tap destination. Keyboard does the same through
 * grid navigation; erase undoes. Tube liquids are fixed hues — game content
 * like card faces, with the selected tube ringed in the theme primary.
 */
import { useMemo, useState } from "react";
import { GameShell, useBoardNavigation, useGameSession, type ControlSpec, type GameEvent } from "@/games/engine";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: ["erase"], surface: "board" };

const TUBE_COUNT = 6;
const CAPACITY = 4;
const COLORS = 4;

/** Fixed liquid hues. Content, like card faces — not theme chrome. */
const LIQUIDS = ["hsl(4, 78%, 55%)", "hsl(212, 78%, 56%)", "hsl(142, 55%, 38%)", "hsl(45, 95%, 50%)"];

/** Bottom-first layers per tube. */
export type Tubes = number[][];

function serialize(tubes: Tubes): string {
  return tubes.map((t) => t.join(",")).join("|");
}

/** Legal pours as [from, to]. Pure. */
export function legalPours(tubes: Tubes): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let from = 0; from < tubes.length; from += 1) {
    const source = tubes[from] ?? [];
    if (source.length === 0) continue;
    // A finished tube pours nowhere and needs nothing poured in.
    const first = source[0] ?? -1;
    if (source.length === CAPACITY && source.every((c) => c === first)) continue;
    const color = source[source.length - 1] ?? -1;
    for (let to = 0; to < tubes.length; to += 1) {
      if (to === from) continue;
      const dest = tubes[to] ?? [];
      if (dest.length >= CAPACITY) continue;
      if (dest.length === 0 || (dest[dest.length - 1] ?? -1) === color) out.push([from, to]);
    }
  }
  return out;
}

/** Pour the contiguous top group. Returns null when nothing moves. Pure. */
export function pour(tubes: Tubes, from: number, to: number): Tubes | null {
  if (from === to) return null;
  // Exported and tested directly, so out-of-range indices are a legal `null`,
  // not a crash — the same contract as every other rejection below.
  const source = tubes[from];
  const dest = tubes[to];
  if (!source || !dest) return null;
  if (source.length === 0 || dest.length >= CAPACITY) return null;
  const color = source[source.length - 1];
  if (color === undefined) return null;
  if (dest.length > 0 && dest[dest.length - 1] !== color) return null;
  const finished = source[0];
  if (source.length === CAPACITY && source.every((c) => c === finished) && dest.length === 0) return null;
  let group = 0;
  for (let i = source.length - 1; i >= 0 && (source[i] ?? -1) === color; i -= 1) group += 1;
  const space = CAPACITY - dest.length;
  const amount = Math.min(group, space);
  const next = tubes.map((t) => t.slice());
  const nextSource = next[from];
  const nextDest = next[to];
  if (!nextSource || !nextDest) return null;
  for (let i = 0; i < amount; i += 1) {
    nextSource.pop();
    nextDest.push(color);
  }
  return next;
}

/** True when every tube is empty or full of one colour. Pure. */
export function isSolved(tubes: Tubes): boolean {
  return tubes.every((t) => t.length === 0 || (t.length === CAPACITY && t.every((c) => c === t[0])));
}

/** Depth-first solvability check with a visited cap. Pure. */
export function isSolvable(start: Tubes): boolean {
  const seen = new Set<string>([serialize(start)]);
  const stack: Tubes[] = [start];
  let budget = 20000;
  while (stack.length > 0 && budget > 0) {
    const current = stack.pop() as Tubes;
    if (isSolved(current)) return true;
    for (const [from, to] of legalPours(current)) {
      const next = pour(current, from, to);
      if (!next) continue;
      const key = serialize(next);
      if (seen.has(key)) continue;
      seen.add(key);
      stack.push(next);
    }
    budget -= 1;
  }
  return false;
}

/** Random fill, retried until the solver clears it. Pure. */
export function dealPuzzle(random: () => number = Math.random): Tubes {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const units: number[] = [];
    for (let c = 0; c < COLORS; c += 1) {
      for (let i = 0; i < CAPACITY; i += 1) units.push(c);
    }
    for (let i = units.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      // Both indices are in-bounds by construction; the fallbacks are unreachable.
      const a = units[i] ?? 0;
      const b = units[j] ?? 0;
      units[i] = b;
      units[j] = a;
    }
    const tubes: Tubes = Array.from({ length: TUBE_COUNT }, () => []);
    // Two tubes stay empty; the rest take four units each.
    const filled = tubes.slice(0, TUBE_COUNT - 2);
    units.forEach((unit, i) => {
      const tube = filled[i % filled.length];
      if (tube) tube.push(unit);
    });
    if (!isSolved(tubes) && isSolvable(tubes)) return tubes;
  }
  // Unreachable in practice; a solved board is the only honest fallback.
  return Array.from({ length: TUBE_COUNT }, () => []);
}

type SortState = { tubes: Tubes; selected: number | null; history: Tubes[]; moves: number; over: boolean };

const fresh = (): SortState => ({ tubes: dealPuzzle(), selected: null, history: [], moves: 0, over: false });

export default function WaterSort({ slug, title }: GameModuleProps) {
  const [sort, setSort] = useState<SortState>(fresh);

  const session = useGameSession({
    slug,
    onRestart: () => {
      setSort(fresh());
    },
  });

  const choose = (index: number) => {
    if (session.phase !== "playing" || sort.over) return;
    // Cursor and selection are always valid tube indices (0–5 over 6 tubes).
    const tube = sort.tubes[index];
    if (!tube) return;
    if (sort.selected === null) {
      if (tube.length === 0) return;
      setSort({ ...sort, selected: index });
      return;
    }
    if (sort.selected === index) {
      setSort({ ...sort, selected: null });
      return;
    }
    const next = pour(sort.tubes, sort.selected, index);
    if (!next) {
      // Illegal target: move the selection there instead of dropping it.
      if (tube.length > 0) setSort({ ...sort, selected: index });
      else setSort({ ...sort, selected: null });
      return;
    }
    const moves = sort.moves + 1;
    if (isSolved(next)) {
      const score = Math.max(100, 1200 - moves * 10);
      setSort({ tubes: next, selected: null, history: [], moves, over: true });
      session.commit({ score, level: 1, resources: moves });
      session.end({ score, level: 1, resources: moves });
      return;
    }
    setSort({ tubes: next, selected: null, history: [...sort.history, sort.tubes], moves, over: false });
    session.commit({ score: 0, level: 1, resources: moves });
  };

  const undo = () => {
    if (session.phase !== "playing" || sort.over || sort.history.length === 0) return;
    const history = sort.history.slice();
    const tubes = history.pop() as Tubes;
    setSort({ tubes, selected: null, history, moves: Math.max(0, sort.moves - 1), over: false });
  };

  const nav = useBoardNavigation({ rows: 1, cols: TUBE_COUNT, onActivate: choose });

  const onEvent = (event: GameEvent) => {
    if (event.kind === "action" && event.id === "erase") undo();
  };

  const readouts = useMemo(() => [{ labelKey: "game.moves" as const, value: sort.moves }], [sort.moves]);

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <div className="game-tube-row" aria-label={title}>
        {sort.tubes.map((tube, i) => (
          <button
            key={i}
            type="button"
            className="game-tube"
            data-active={sort.selected === i}
            aria-disabled={sort.over}
            aria-label={`${i + 1}, ${tube.length}`}
            {...nav.cellProps(i)}
            onClick={() => {
              nav.setCursor(i);
              choose(i);
            }}
          >
            {tube.map((unit, layer) => (
              <span key={layer} className="game-liquid" style={{ backgroundColor: LIQUIDS[unit] ?? "transparent" }} />
            ))}
          </button>
        ))}
      </div>
    </GameShell>
  );
}
