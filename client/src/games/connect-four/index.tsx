/**
 * Connect Four — column selection over `useBoardNavigation`, no canvas.
 *
 * Owns only its rules: gravity drops, four-in-a-row scans, and a one-ply
 * heuristic opponent (takes a win, blocks a loss, otherwise prefers the
 * centre — sharp enough to punish carelessness, loose enough to beat). The
 * seven column buttons are the board's single tab stop each via roving
 * tabindex; tapping a column or pressing the Action button drops there.
 * The 42 cells below are presentational — their state lives in the column
 * buttons' accessible names, so a tap target never doubles as a readout.
 */
import { useMemo, useState } from "react";
import { GameShell, useBoardNavigation, useGameSession, type ControlSpec, type GameEvent } from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

const COLS = 7;
const ROWS = 6;

/**
 * The Action button drops into the focused column, so touch gets the same
 * move without hunting for the right tab stop. Arrows stay with navigation.
 */
const SPEC: ControlSpec = { actions: ["primary"], surface: "board" };

type Cell = 0 | 1 | 2;

/** All four-in-a-row lines through `index`, or the winning line. Pure. */
export function winningLine(grid: Cell[], index: number): number[] {
  const player = grid[index];
  if (player === 0) return [];
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const directions: Array<[number, number]> = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (const [dx, dy] of directions) {
    const line = [index];
    for (const sign of [1, -1]) {
      let c = col + dx * sign;
      let r = row + dy * sign;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && grid[r * COLS + c] === player) {
        line.push(r * COLS + c);
        c += dx * sign;
        r += dy * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return [];
}

/** Lowest free row in a column, or -1 when it is full. Pure. */
export function freeRow(grid: Cell[], col: number): number {
  for (let r = ROWS - 1; r >= 0; r -= 1) {
    if (grid[r * COLS + col] === 0) return r;
  }
  return -1;
}

/** Heuristic reply for player 2: win, block, centre-first. Pure. */
export function aiColumn(grid: Cell[], random: () => number = Math.random): number {
  const open: number[] = [];
  for (let c = 0; c < COLS; c += 1) if (freeRow(grid, c) >= 0) open.push(c);
  if (open.length === 0) return -1;
  // Take a win.
  for (const c of open) {
    const next = grid.slice();
    next[freeRow(next, c) * COLS + c] = 2;
    if (winningLine(next, freeRow(grid, c) * COLS + c).length > 0) return c;
  }
  // Block a loss.
  for (const c of open) {
    const next = grid.slice();
    next[freeRow(next, c) * COLS + c] = 1;
    if (winningLine(next, freeRow(grid, c) * COLS + c).length > 0) return c;
  }
  // Otherwise the centre, with a little wobble so it does not play one line.
  // `open` is non-empty here and every entry is a real column, so the pick below
  // always lands; `?? -1` (no column) is type-level only.
  const preference = [3, 2, 4, 1, 5, 0, 6].filter((c) => open.includes(c));
  const jitter = Math.floor(random() * Math.min(3, preference.length));
  return preference[jitter] ?? -1;
}

type BoardState = { grid: Cell[]; over: boolean; result: "" | "draw" | "win" | "loss" };

const fresh = (): BoardState => ({ grid: Array(COLS * ROWS).fill(0) as Cell[], over: false, result: "" });

export default function ConnectFour({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const [board, setBoard] = useState<BoardState>(fresh);

  const session = useGameSession({
    slug,
    onRestart: () => {
      setBoard(fresh());
    },
  });

  // The whole move — player disc, instant AI reply, terminal check — computed
  // from current state in one pass, so the session calls below cannot disagree
  // with what is on screen. (See tic-tac-toe: setState updaters run late.)
  const drop = (col: number) => {
    if (session.phase !== "playing" || board.over) return;
    const row = freeRow(board.grid, col);
    if (row < 0) return;
    const grid = board.grid.slice() as Cell[];
    grid[row * COLS + col] = 1;
    let result: BoardState["result"] = "";
    if (winningLine(grid, row * COLS + col).length > 0) {
      result = "win";
    } else {
      const reply = aiColumn(grid);
      if (reply >= 0) {
        const aiRow = freeRow(grid, reply);
        grid[aiRow * COLS + reply] = 2;
        if (winningLine(grid, aiRow * COLS + reply).length > 0) result = "loss";
      }
      if (result === "" && grid.every((c) => c !== 0)) result = "draw";
    }
    if (result !== "") {
      const score = result === "win" ? 100 : result === "draw" ? 25 : 0;
      setBoard({ grid, over: true, result });
      session.commit({ score, level: 1, resources: 0 });
      session.end({ score, level: 1, resources: 0 });
      return;
    }
    setBoard({ grid, over: false, result: "" });
    session.commit({ score: 0, level: 1, resources: 0 });
  };

  const nav = useBoardNavigation({ rows: 1, cols: COLS, onActivate: drop });

  const onEvent = (event: GameEvent) => {
    if (event.kind === "action" && event.id === "primary") drop(nav.cursor);
  };

  const counts = useMemo(() => {
    const out: number[] = Array(COLS).fill(0);
    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        if (board.grid[r * COLS + c] !== 0) out[c] = (out[c] ?? 0) + 1;
      }
    }
    return out;
  }, [board.grid]);

  const winSet = useMemo(() => {
    for (let i = 0; i < board.grid.length; i += 1) {
      if (board.grid[i] !== 0) {
        const line = winningLine(board.grid, i);
        if (line.length > 0) return new Set(line);
      }
    }
    return new Set<number>();
  }, [board.grid]);

  const status = board.over
    ? board.result === "draw"
      ? t("game.draw")
      : board.result === "win"
        ? t("game.over")
        : t("game.over")
    : t("game.turnToMove", { mark: "●" });

  const moves = board.grid.filter((c) => c !== 0).length;
  const readouts = useMemo(() => [{ labelKey: "game.moves" as const, value: moves }], [moves]);

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <div style={{ display: "grid", gap: 12, width: "100%", maxWidth: 560 }}>
        <p className="game-turn" role="status">{status}</p>
        <div className="game-column-row" aria-label={title}>
          {Array.from({ length: COLS }, (_, c) => (
            <button
              key={c}
              type="button"
              className="game-column-pick"
              data-active={nav.cursor === c}
              aria-disabled={board.over || (counts[c] ?? ROWS) >= ROWS}
              aria-label={`${c + 1}: ${counts[c]}`}
              {...nav.cellProps(c)}
              onClick={() => {
                nav.setCursor(c);
                drop(c);
              }}
            >
              ▼
            </button>
          ))}
        </div>
        <div className="game-board" style={{ ["--cols" as string]: COLS }} aria-hidden="true">
          {board.grid.map((cell, i) => (
            <div
              key={i}
              className="game-cell"
              data-played={cell !== 0}
              data-win={winSet.has(i)}
              style={{ minWidth: 0, minHeight: 0, aspectRatio: "1", fontSize: 20, cursor: "default" }}
            >
              {cell === 0 ? "" : cell === 1 ? "●" : "○"}
            </div>
          ))}
        </div>
      </div>
    </GameShell>
  );
}
