/**
 * Block Fit — place tray shapes on an 8×8 board, clear full rows and columns.
 *
 * Owns only its rules: a shape library with rotation, fit checks in all four
 * orientations, line clears, tray refills, and an honest dead-end check after
 * every move — the run ends the moment nothing fits, never one move later.
 * Tray pieces are buttons (tap to arm, tap a board cell to place); the
 * keyboard arms with Tab and places with Enter, rotating with F. The focused
 * cell previews the placement when it fits.
 */
import { useMemo, useState } from "react";
import { GameShell, useBoardNavigation, useGameSession, type ControlSpec } from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: [], surface: "board" };

const SIZE = 8;
const CELLS = SIZE * SIZE;

type Shape = Array<[number, number]>;

const LIBRARY: Shape[] = [
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [1, 0]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 2]],
];

/** 90° clockwise, re-anchored to the top-left. Pure. */
export function rotate(shape: Shape): Shape {
  const turned = shape.map(([x, y]) => [-y, x] as [number, number]);
  const minX = Math.min(...turned.map(([x]) => x));
  const minY = Math.min(...turned.map(([, y]) => y));
  return turned.map(([x, y]) => [x - minX, y - minY] as [number, number]);
}

/** Cells a shape would occupy from a top-left anchor, or null. Pure. */
export function cellsFor(shape: Shape, anchor: number): number[] | null {
  const ax = anchor % SIZE;
  const ay = Math.floor(anchor / SIZE);
  const cells: number[] = [];
  for (const [dx, dy] of shape) {
    const x = ax + dx;
    const y = ay + dy;
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return null;
    cells.push(y * SIZE + x);
  }
  return cells;
}

/** True when the shape lands on empty cells. Pure. */
export function fits(board: number[], shape: Shape, anchor: number): boolean {
  const cells = cellsFor(shape, anchor);
  return cells !== null && cells.every((c) => board[c] === 0);
}

/** Full rows and columns. Pure. */
export function fullLines(board: number[]): number[] {
  const out: number[] = [];
  for (let r = 0; r < SIZE; r += 1) {
    let full = true;
    for (let c = 0; c < SIZE; c += 1) if (board[r * SIZE + c] === 0) full = false;
    if (full) for (let c = 0; c < SIZE; c += 1) out.push(r * SIZE + c);
  }
  for (let c = 0; c < SIZE; c += 1) {
    let full = true;
    for (let r = 0; r < SIZE; r += 1) if (board[r * SIZE + c] === 0) full = false;
    if (full) for (let r = 0; r < SIZE; r += 1) out.push(r * SIZE + c);
  }
  return Array.from(new Set(out));
}

/** True when any tray piece fits anywhere in any rotation. Pure. */
export function anyFit(board: number[], tray: Array<Shape | null>): boolean {
  for (const piece of tray) {
    if (!piece) continue;
    let rotated: Shape = piece;
    for (let r = 0; r < 4; r += 1) {
      for (let anchor = 0; anchor < CELLS; anchor += 1) {
        if (fits(board, rotated, anchor)) return true;
      }
      rotated = rotate(rotated);
    }
  }
  return false;
}

function dealTray(random: () => number = Math.random): Shape[] {
  // Eight shapes by construction; failing fast beats dealing an empty tray.
  const first = LIBRARY[0];
  if (!first) throw new Error("library-empty-unreachable");
  return [0, 1, 2].map(() => LIBRARY[Math.floor(random() * LIBRARY.length)] ?? first);
}

type FitState = {
  board: number[];
  tray: Array<Shape | null>;
  selected: number;
  score: number;
  clears: number;
  placed: number;
  over: boolean;
};

const fresh = (): FitState => ({
  board: Array(CELLS).fill(0),
  tray: dealTray(),
  selected: 0,
  score: 0,
  clears: 0,
  placed: 0,
  over: false,
});

export default function BlockFit({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const [fit, setFit] = useState<FitState>(fresh);

  const session = useGameSession({
    slug,
    onRestart: () => {
      setFit(fresh());
    },
  });

  const rotateSelected = () => {
    if (session.phase !== "playing" || fit.over) return;
    const tray = fit.tray.slice();
    const piece = tray[fit.selected];
    if (!piece) return;
    tray[fit.selected] = rotate(piece);
    setFit({ ...fit, tray });
  };

  const place = (anchor: number) => {
    if (session.phase !== "playing" || fit.over) return;
    const piece = fit.tray[fit.selected];
    if (!piece || !fits(fit.board, piece, anchor)) return;
    const board = fit.board.slice();
    for (const cell of cellsFor(piece, anchor) as number[]) board[cell] = 1;
    const cleared = fullLines(board);
    for (const cell of cleared) board[cell] = 0;
    const clears = fit.clears + (cleared.length > 0 ? 1 : 0);
    const score = fit.score + piece.length + cleared.length * 10;
    let tray = fit.tray.slice();
    tray[fit.selected] = null;
    if (tray.every((p) => p === null)) tray = dealTray();
    const selected = tray[fit.selected] ? fit.selected : tray.findIndex((p) => p !== null);
    if (!anyFit(board, tray)) {
      setFit({ board, tray, selected: Math.max(0, selected), score, clears, placed: fit.placed + 1, over: true });
      session.commit({ score, level: clears + 1, resources: clears });
      session.end({ score, level: clears + 1, resources: clears });
      return;
    }
    const next = { board, tray, selected: Math.max(0, selected), score, clears, placed: fit.placed + 1, over: false };
    setFit(next);
    session.commit({ score, level: clears + 1, resources: clears });
  };

  const nav = useBoardNavigation({
    rows: SIZE,
    cols: SIZE,
    onActivate: place,
    onAltActivate: () => rotateSelected(),
  });

  const preview = useMemo(() => {
    const piece = fit.tray[fit.selected];
    if (!piece || fit.over) return new Set<number>();
    return new Set(fits(fit.board, piece, nav.cursor) ? (cellsFor(piece, nav.cursor) as number[]) : []);
  }, [fit.board, fit.tray, fit.selected, nav.cursor, fit.over]);

  const filled = useMemo(() => {
    const set = new Set<number>();
    fit.board.forEach((v, i) => {
      if (v !== 0) set.add(i);
    });
    return set;
  }, [fit.board]);

  const readouts = useMemo(
    () => [
      { labelKey: "game.level" as const, value: fit.clears + 1 },
      { labelKey: "game.moves" as const, value: fit.placed },
    ],
    [fit.clears, fit.placed],
  );

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={() => undefined}>
      <div style={{ display: "grid", gap: 12, justifyItems: "center", width: "100%", maxWidth: 560 }}>
        <div className="game-mode-row" role="group" aria-label={title}>
          {fit.tray.map((piece, i) => (
            <button
              key={i}
              type="button"
              className="game-column-pick"
              style={{ minHeight: 52, padding: "6px 12px" }}
              data-active={fit.selected === i}
              aria-pressed={fit.selected === i}
              aria-label={`${i + 1}, ${piece ? piece.length : 0}`}
              disabled={!piece || fit.over}
              onClick={() => setFit({ ...fit, selected: i })}
            >
              <span aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(4, 8px)", gap: 1 }}>
                {Array.from({ length: 12 }, (_, k) => {
                  const x = k % 4;
                  const y = Math.floor(k / 4);
                  const on = piece?.some(([px, py]) => px === x && py === y) ?? false;
                  return <i key={k} style={{ width: 8, height: 8, backgroundColor: on ? "currentColor" : "transparent" }} />;
                })}
              </span>
            </button>
          ))}
          <button type="button" className="game-column-pick" style={{ minHeight: 52, padding: "0 18px" }} onClick={rotateSelected} aria-label={t("control.rotateCw")}>
            <span aria-hidden="true">↻</span>
          </button>
        </div>
        <div className="game-board-dense" style={{ ["--cols" as string]: SIZE }} aria-label={title}>
          {Array.from({ length: CELLS }, (_, i) => (
            <button
              key={i}
              type="button"
              className="game-cell"
              data-played={filled.has(i)}
              data-selected={preview.has(i)}
              aria-disabled={fit.over}
              aria-label={`${i + 1}${filled.has(i) ? ", 1" : ""}`}
              {...nav.cellProps(i)}
              onClick={() => place(i)}
            >
              {filled.has(i) ? "■" : preview.has(i) ? "·" : ""}
            </button>
          ))}
        </div>
      </div>
    </GameShell>
  );
}
