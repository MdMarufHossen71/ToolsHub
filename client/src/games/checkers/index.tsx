/**
 * Checkers — classic draughts against a greedy computer, on a real board.
 *
 * Owns only its rules: forced captures with multi-jump chains, kings,
 * promotion, a sixty-quiet-move draw rule, and an opponent that always takes
 * (longest capture first) but otherwise plays a beatable positional game.
 * Select with a tap or Enter, land with a second one; legal targets carry a
 * dot, the selected piece a ring. Men are filled discs, kings crowned —
 * shape, never colour alone.
 */
import { useMemo, useState } from "react";
import { GameShell, useBoardNavigation, useGameSession, type ControlSpec } from "@/games/engine";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: [], surface: "board" };

const SIZE = 8;
const CELLS = SIZE * SIZE;
const QUIET_DRAW = 60;

/** 0 empty, 1/2 player man/king, 3/4 computer man/king. Dark squares only. */
export type Piece = 0 | 1 | 2 | 3 | 4;
export type Move = { from: number; path: number[]; captured: number[] };

const dark = (i: number) => (Math.floor(i / SIZE) + (i % SIZE)) % 2 === 1;
const rowOf = (i: number) => Math.floor(i / SIZE);
const colOf = (i: number) => i % SIZE;
const at = (r: number, c: number) => (r < 0 || r >= SIZE || c < 0 || c >= SIZE ? -1 : r * SIZE + c);
const isPlayer = (p: Piece) => p === 1 || p === 2;
const isComputer = (p: Piece) => p === 3 || p === 4;
const isKing = (p: Piece) => p === 2 || p === 4;

function stepDirs(piece: Piece): Array<[number, number]> {
  if (isKing(piece)) return [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  // Player climbs (row decreases), the computer descends.
  return isPlayer(piece) ? [[-1, -1], [1, -1]] : [[-1, 1], [1, 1]];
}

/** All capture chains from one piece. Pure. */
export function capturesFrom(board: Piece[], from: number): Move[] {
  const piece = board[from] ?? 0;
  const results: Move[] = [];
  const walk = (cells: Piece[], pos: number, path: number[], captured: number[]) => {
    let extended = false;
    for (const [dc, dr] of stepDirs(piece)) {
      const r = rowOf(pos);
      const c = colOf(pos);
      const mid = at(r + dr, c + dc);
      const land = at(r + dr * 2, c + dc * 2);
      if (mid < 0 || land < 0) continue;
      const landing = cells[land];
      if (landing === undefined || landing !== 0) continue;
      const victim = cells[mid] ?? 0;
      const enemy = isPlayer(piece) ? isComputer(victim) : isPlayer(victim);
      if (!enemy || captured.includes(mid)) continue;
      extended = true;
      const next = cells.slice();
      next[pos] = 0;
      next[mid] = 0;
      next[land] = piece;
      walk(next, land, [...path, land], [...captured, mid]);
    }
    if (!extended && captured.length > 0) results.push({ from, path, captured });
  };
  walk(board.slice(), from, [], []);
  return results;
}

/** Quiet steps for one piece. Pure. */
export function quietsFrom(board: Piece[], from: number): Move[] {
  const piece = board[from] ?? 0;
  const out: Move[] = [];
  for (const [dc, dr] of stepDirs(piece)) {
    const land = at(rowOf(from) + dr, colOf(from) + dc);
    if (land >= 0 && board[land] === 0) out.push({ from, path: [land], captured: [] });
  }
  return out;
}

function sidePieces(board: Piece[], computer: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < CELLS; i += 1) {
    if (computer ? isComputer(board[i] ?? 0) : isPlayer(board[i] ?? 0)) out.push(i);
  }
  return out;
}

/**
 * Every legal move for a side. Captures are forced: when any exist, quiet
 * steps are not offered at all. Pure.
 */
export function legalMoves(board: Piece[], computer: boolean): Move[] {
  const takes: Move[] = [];
  for (const from of sidePieces(board, computer)) {
    takes.push(...capturesFrom(board, from));
  }
  if (takes.length > 0) return takes;
  const quiets: Move[] = [];
  for (const from of sidePieces(board, computer)) {
    quiets.push(...quietsFrom(board, from));
  }
  return quiets;
}

/** Computer reply: longest capture, else a step that avoids walking into a reply capture. */
export function aiMove(board: Piece[], random: () => number = Math.random): Move | null {
  const moves = legalMoves(board, true);
  if (moves.length === 0) return null;
  const takes = moves.filter((m) => m.captured.length > 0);
  if (takes.length > 0) {
    takes.sort((a, b) => b.captured.length - a.captured.length || (promotes(board, b) ? -1 : 0));
    const head = takes[0];
    if (!head) return null;
    const longest = head.captured.length;
    const best = takes.filter((m) => m.captured.length === longest);
    return best[Math.floor(random() * best.length)] ?? null;
  }
  // Prefer steps the player cannot answer by capturing, then steps forward.
  const scored = moves.map((move) => {
    const next = applyMove(board, move, true);
    const reply = legalMoves(next, false).some((m) => m.captured.length > 0);
    const last = move.path[move.path.length - 1] ?? move.from;
    const forward = rowOf(last) - rowOf(move.from);
    return { move, score: (reply ? 0 : 2) + forward * 0.1 + random() };
  });
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];
  if (!winner) return null;
  return winner.move;
}

function promotes(board: Piece[], move: Move): boolean {
  const piece = board[move.from] ?? 0;
  const land = move.path[move.path.length - 1] ?? move.from;
  if (isKing(piece)) return false;
  return rowOf(land) === (isPlayer(piece) ? 0 : SIZE - 1);
}

/** Execute a move with promotion. Pure. */
export function applyMove(board: Piece[], move: Move, computer: boolean): Piece[] {
  const next = board.slice();
  const piece = next[move.from] ?? 0;
  next[move.from] = 0;
  for (const victim of move.captured) next[victim] = 0;
  const land = move.path[move.path.length - 1] ?? move.from;
  const crowned = !isKing(piece) && rowOf(land) === (computer ? SIZE - 1 : 0);
  next[land] = (crowned ? (computer ? 4 : 2) : piece) as Piece;
  return next;
}

const initialBoard = (): Piece[] => {
  const board = Array(CELLS).fill(0) as Piece[];
  for (let i = 0; i < CELLS; i += 1) {
    if (!dark(i)) continue;
    const r = rowOf(i);
    if (r < 3) board[i] = 3;
    else if (r > 4) board[i] = 1;
  }
  return board;
};

type CheckerState = { board: Piece[]; selected: number | null; quiet: number; over: boolean; result: "" | "win" | "loss" | "draw"; captured: number };

const fresh = (): CheckerState => ({ board: initialBoard(), selected: null, quiet: 0, over: false, result: "", captured: 0 });

export default function Checkers({ slug, title }: GameModuleProps) {
  const [game, setGame] = useState<CheckerState>(fresh);

  const session = useGameSession({
    slug,
    onRestart: () => {
      setGame(fresh());
    },
  });

  const finish = (board: Piece[], result: "win" | "loss" | "draw", captured: number, quiet: number) => {
    const score = result === "win" ? 100 + captured * 5 : result === "draw" ? 25 : 0;
    setGame({ board, selected: null, quiet, over: true, result, captured });
    session.commit({ score, level: 1, resources: captured });
    session.end({ score, level: 1, resources: captured });
  };

  /** The computer answers at once — no timer to lose to a pause. */
  const answer = (board: Piece[], captured: number, quiet: number) => {
    const reply = aiMove(board);
    if (!reply) {
      finish(board, "win", captured, quiet);
      return;
    }
    const next = applyMove(board, reply, true);
    const took = reply.captured.length > 0;
    const nextQuiet = took ? 0 : quiet + 1;
    if (nextQuiet >= QUIET_DRAW) {
      finish(next, "draw", captured, nextQuiet);
      return;
    }
    if (sidePieces(next, false).length === 0 || legalMoves(next, false).length === 0) {
      finish(next, "loss", captured, nextQuiet);
      return;
    }
    setGame({ board: next, selected: null, quiet: nextQuiet, over: false, result: "", captured });
    session.commit({ score: 0, level: 1, resources: captured });
  };

  const activate = (index: number) => {
    if (session.phase !== "playing" || game.over || !dark(index)) return;
    const piece = game.board[index] ?? 0;
    // A chained capture must continue with the same piece: only its own
    // landings are offered, never the whole forced-capture list.
    if (game.selected !== null) {
      const continuation = capturesFrom(game.board, game.selected).find((m) => m.path[m.path.length - 1] === index);
      if (continuation) {
        const board = applyMove(game.board, continuation, false);
        const captured = game.captured + continuation.captured.length;
        const land = continuation.path[continuation.path.length - 1];
        // Paths from `capturesFrom` always end in a landing; this bail is
        // type-level only and simply drops a broken selection.
        if (land === undefined) {
          setGame({ ...game, selected: null });
          return;
        }
        if (capturesFrom(board, land).length > 0) {
          setGame({ ...game, board, selected: land });
          session.commit({ score: 0, level: 1, resources: captured });
          return;
        }
        if (sidePieces(board, true).length === 0 || legalMoves(board, true).length === 0) {
          finish(board, "win", captured, 0);
          return;
        }
        setGame({ board, selected: null, quiet: 0, over: false, result: "", captured });
        answer(board, captured, 0);
        return;
      }
    }
    if (isPlayer(piece)) {
      const moves = legalMoves(game.board, false).filter((m) => m.from === index);
      if (moves.length > 0) {
        setGame({ ...game, selected: index });
        return;
      }
    }
    if (game.selected !== null) {
      const move = legalMoves(game.board, false).find((m) => m.from === game.selected && m.path[m.path.length - 1] === index);
      if (move) {
        const board = applyMove(game.board, move, false);
        const captured = game.captured + move.captured.length;
        const land = move.path[move.path.length - 1];
        if (land === undefined) {
          setGame({ ...game, selected: null });
          return;
        }
        const more = move.captured.length > 0 ? capturesFrom(board, land) : [];
        if (more.length > 0) {
          setGame({ ...game, board, selected: land });
          session.commit({ score: 0, level: 1, resources: captured });
          return;
        }
        if (sidePieces(board, true).length === 0 || legalMoves(board, true).length === 0) {
          finish(board, "win", captured, 0);
          return;
        }
        const nextQuiet = move.captured.length > 0 ? 0 : game.quiet + 1;
        if (nextQuiet >= QUIET_DRAW) {
          finish(board, "draw", captured, nextQuiet);
          return;
        }
        setGame({ board, selected: null, quiet: nextQuiet, over: false, result: "", captured });
        answer(board, captured, nextQuiet);
        return;
      }
      setGame({ ...game, selected: null });
    }
  };

  const nav = useBoardNavigation({ rows: SIZE, cols: SIZE, onActivate: activate });

  const targets = useMemo(() => {
    if (game.selected === null) return new Set<number>();
    // Immediate next landings only: a chain's later landings are not offered
    // until the piece actually gets there.
    const moves = legalMoves(game.board, false).filter((m) => m.from === game.selected);
    return new Set(moves.map((m) => m.path[0] ?? -1));
  }, [game.board, game.selected]);

  const glyph = (piece: Piece): string => {
    if (piece === 1) return "●";
    if (piece === 2) return "♚";
    if (piece === 3) return "○";
    if (piece === 4) return "♔";
    return "";
  };

  const readouts = useMemo(() => [{ labelKey: "game.moves" as const, value: game.captured }], [game.captured]);

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={() => undefined}>
      <div className="game-board-dense" style={{ ["--cols" as string]: SIZE }} aria-label={title}>
        {game.board.map((piece, i) => (
          <button
            key={i}
            type="button"
            className="game-cell"
            data-dark={dark(i)}
            data-played={piece !== 0}
            data-selected={game.selected === i || targets.has(i)}
            aria-disabled={game.over}
            aria-label={`${i + 1}${piece !== 0 ? `, ${glyph(piece)}` : ""}`}
            {...nav.cellProps(i)}
            onClick={() => activate(i)}
          >
            {targets.has(i) && piece === 0 ? "·" : glyph(piece)}
          </button>
        ))}
      </div>
    </GameShell>
  );
}
