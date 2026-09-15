/**
 * Tic Tac Toe — board game over `useBoardNavigation`, no canvas.
 *
 * Owns only its rules: a 3×3 board, win/draw detection, and an optimal
 * computer opponent (minimax, so it never loses — a draw is the player's
 * prize). Focus, arrows, touch taps, pause, persistence and the legend all
 * belong to `GameShell` and the engine. Cells are real buttons, so touch
 * needs no extra d-pad: the board itself is the control.
 */
import { useMemo, useState } from "react";
import { GameShell, useBoardNavigation, useGameSession, type ControlSpec } from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

/** No directional actions: the arrows belong to grid navigation, not to play. */
const SPEC: ControlSpec = { actions: [], surface: "board" };

type Mark = "X" | "O" | "";
type Mode = "ai" | "duo";

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/** Winner and the winning line, if any. Pure, so it is unit-testable. */
export function winnerOf(board: Mark[]): { winner: Mark; line: number[] } {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] !== "" && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return { winner: "", line: [] };
}

function emptyCells(board: Mark[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i += 1) if (board[i] === "") out.push(i);
  return out;
}

function minimax(board: Mark[], turn: Mark, depth: number): number {
  const { winner } = winnerOf(board);
  if (winner === "O") return 10 - depth;
  if (winner === "X") return depth - 10;
  const moves = emptyCells(board);
  if (moves.length === 0) return 0;
  if (turn === "O") {
    let best = -Infinity;
    for (const m of moves) {
      board[m] = "O";
      best = Math.max(best, minimax(board, "X", depth + 1));
      board[m] = "";
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    board[m] = "X";
    best = Math.min(best, minimax(board, "O", depth + 1));
    board[m] = "";
  }
  return best;
}

/** Best reply for O on the current board. Centre first on ties. */
export function bestReply(board: Mark[]): number {
  const order = [4, 0, 2, 6, 8, 1, 3, 5, 7];
  let best = -Infinity;
  let pick = emptyCells(board)[0] ?? -1;
  for (const m of order) {
    if (board[m] !== "") continue;
    board[m] = "O";
    const score = minimax(board, "X", 0);
    board[m] = "";
    if (score > best) {
      best = score;
      pick = m;
    }
  }
  return pick;
}

type BoardState = { cells: Mark[]; turn: Mark; over: boolean; result: "" | "draw" | Mark };

const fresh = (): BoardState => ({ cells: Array(9).fill("") as Mark[], turn: "X", over: false, result: "" });

export default function TicTacToe({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const [board, setBoard] = useState<BoardState>(fresh);
  const [mode, setMode] = useState<Mode>("ai");

  const session = useGameSession({
    slug,
    onRestart: () => {
      setBoard(fresh());
    },
  });

  // Plain function, not memoized: `useBoardNavigation` keeps the latest one in a
  // ref, and turn-based renders are cheap. Computing the whole next state here
  // (rather than inside a setState updater) keeps the session calls consistent,
  // because updaters run later during render-commit, not synchronously.
  const place = (index: number) => {
    if (session.phase !== "playing" || board.over || board.cells[index] !== "") return;
    const cells = board.cells.slice() as Mark[];
    cells[index] = board.turn;
    let turn: Mark = board.turn === "X" ? "O" : "X";
    // The computer answers at once: no timer to clean up, no move to lose to a
    // pause. Instant is also honest — it never pretends to think.
    if (mode === "ai" && turn === "O") {
      const reply = bestReply(cells);
      if (reply >= 0) {
        cells[reply] = "O";
        turn = "X";
      }
    }
    const { winner } = winnerOf(cells);
    const full = cells.every((c) => c !== "");
    if (winner !== "" || full) {
      const score = winner === "X" ? 100 : winner === "" ? 25 : 0;
      setBoard({ cells, turn, over: true, result: winner === "" ? "draw" : winner });
      session.commit({ score, level: 1, resources: 0 });
      session.end({ score, level: 1, resources: 0 });
      return;
    }
    setBoard({ cells, turn, over: false, result: "" });
    session.commit({ score: 0, level: 1, resources: 0 });
  };

  const nav = useBoardNavigation({ rows: 3, cols: 3, onActivate: place });

  const switchMode = (next: Mode) => {
    setMode(next);
    setBoard(fresh());
    session.restart();
  };

  const winSet = useMemo(() => new Set(winnerOf(board.cells).line), [board.cells]);

  const status = board.over
    ? board.result === "draw"
      ? t("game.draw")
      : t("game.over")
    : t("game.turnToMove", { mark: board.turn });

  const readouts = useMemo(
    () => [{ labelKey: "game.moves" as const, value: board.cells.filter((c) => c !== "").length }],
    [board.cells],
  );

  // Coordinates are numerals, identical in both languages, so no dictionary key.
  const cellName = (i: number) => `${Math.floor(i / 3) + 1}-${(i % 3) + 1}`;

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={() => undefined}>
      <div style={{ display: "grid", gap: 12, width: "100%", maxWidth: 560 }}>
        <div className="game-mode-row" role="group" aria-label={title}>
          {(["ai", "duo"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className="game-column-pick"
              style={{ padding: "0 18px" }}
              data-active={mode === m}
              aria-pressed={mode === m}
              onClick={() => switchMode(m)}
            >
              {m === "ai" ? t("game.modeComputer") : t("game.modeTwoPlayers")}
            </button>
          ))}
        </div>
        <p className="game-turn" role="status">{status}</p>
        <div className="game-board" style={{ ["--cols" as string]: 3 }} aria-label={title}>
          {board.cells.map((mark, i) => (
            <button
              key={i}
              type="button"
              className="game-cell"
              data-played={mark !== ""}
              data-win={winSet.has(i)}
              aria-disabled={mark !== "" || board.over}
              aria-label={mark !== "" ? `${cellName(i)}, ${mark}` : cellName(i)}
              {...nav.cellProps(i)}
              onClick={() => place(i)}
            >
              {mark}
            </button>
          ))}
        </div>
      </div>
    </GameShell>
  );
}
