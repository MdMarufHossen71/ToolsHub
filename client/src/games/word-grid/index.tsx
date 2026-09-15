/**
 * Word Grid — five letters, six tries, colour clues. The engine's `letters`
 * pad plus physical typing feed `text` events; the Action button submits and
 * erase deletes, on touch and on desktop alike.
 *
 * Owns only its rules: a curated five-letter list, duplicate-safe clueing
 * (two passes: greens first, then yellows against remaining counts), and
 * per-try scoring. Letter input suppresses `R` restart by design.
 */
import { useMemo, useState } from "react";
import { GameShell, useGameSession, type ControlSpec, type GameEvent } from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: ["primary", "erase"], surface: "board", letters: true };

const TRIES = 6;
const LENGTH = 5;

export const WORDS = [
  "ABOUT", "ABOVE", "ACTOR", "AFTER", "AGAIN", "AGENT", "AHEAD", "ALARM",
  "ALBUM", "ALERT", "ALIKE", "ALIVE", "ALLOW", "ALONE", "ALONG", "ALOUD",
  "APPLE", "APPLY", "ARENA", "ARGUE", "ARISE", "ARRAY", "ASIDE", "ASSET",
  "AUDIO", "AVOID", "AWAKE", "AWARD", "AWARE", "BACON", "BADGE", "BAKER",
  "BASIC", "BEAST", "BEGIN", "BELOW", "BENCH", "BIRTH", "BLACK", "BLADE",
  "BLAME", "BLANK", "BLAST", "BLEND", "BLESS", "BLIND", "BLOCK", "BLOOD",
  "BOARD", "BONUS", "BOOST", "BOOTH", "BOUND", "BRAIN", "BRAND", "BRAVE",
  "BREAD", "BREAK", "BRICK", "BRIDE", "BRIEF", "BRING", "BROAD", "BROKE",
  "BROWN", "BRUSH", "BUILD", "BUNCH", "BUYER", "CABIN", "CABLE", "CARGO",
  "CARRY", "CATCH", "CAUSE", "CHAIR", "CHARM", "CHART", "CHASE", "CHEAP",
  "CHECK", "CHESS", "CHEST", "CHIEF", "CHILD", "CHOIR", "CHORE", "CHUNK",
  "CIVIL", "CLAIM", "CLASS", "CLEAN", "CLEAR", "CLERK", "CLICK", "CLIFF",
  "CLIMB", "CLOCK", "CLOSE", "CLOTH", "CLOUD", "COACH", "COAST", "COLOR",
];

export type Clue = "correct" | "present" | "absent";

/**
 * Standard two-pass clueing: greens consume their letter first, so a guess
 * with doubled letters cannot earn two yellows from one target letter. Pure.
 */
export function clueGuess(guess: string, target: string): Clue[] {
  const clues: Clue[] = Array(LENGTH).fill("absent");
  const remaining = new Map<string, number>();
  for (let i = 0; i < LENGTH; i += 1) {
    // Same-length caller strings by contract; `?? ""` is type-level only.
    const g = guess[i] ?? "";
    const t = target[i] ?? "";
    if (g === t) {
      clues[i] = "correct";
    } else {
      remaining.set(t, (remaining.get(t) ?? 0) + 1);
    }
  }
  for (let i = 0; i < LENGTH; i += 1) {
    if (clues[i] !== "correct") {
      const g = guess[i] ?? "";
      const left = remaining.get(g) ?? 0;
      if (left > 0) {
        clues[i] = "present";
        remaining.set(g, left - 1);
      }
    }
  }
  return clues;
}

export function pickTarget(random: () => number = Math.random): string {
  // Non-empty word list; the fallback below is type-level only.
  return WORDS[Math.floor(random() * WORDS.length)] ?? "";
}

type GridState = { target: string; guesses: string[]; entry: string; notice: boolean; over: boolean; won: boolean };

const fresh = (): GridState => ({ target: pickTarget(), guesses: [], entry: "", notice: false, over: false, won: false });

export default function WordGrid({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const [grid, setGrid] = useState<GridState>(fresh);

  const session = useGameSession({
    slug,
    onRestart: () => {
      setGrid(fresh());
    },
  });

  const submit = () => {
    if (session.phase !== "playing" || grid.over || grid.entry.length !== LENGTH) return;
    if (!WORDS.includes(grid.entry)) {
      setGrid({ ...grid, notice: true });
      return;
    }
    const guesses = [...grid.guesses, grid.entry];
    const won = grid.entry === grid.target;
    if (won || guesses.length >= TRIES) {
      const score = won ? (TRIES + 1 - guesses.length) * 100 : 0;
      setGrid({ target: grid.target, guesses, entry: "", notice: false, over: true, won });
      session.commit({ score, level: 1, resources: guesses.length });
      session.end({ score, level: 1, resources: guesses.length });
      return;
    }
    setGrid({ ...grid, guesses, entry: "", notice: false });
    session.commit({ score: 0, level: 1, resources: guesses.length });
  };

  const onEvent = (event: GameEvent) => {
    if (grid.over || session.phase !== "playing") return;
    if (event.kind === "text" && /^[A-Z]$/.test(event.value)) {
      if (grid.entry.length < LENGTH) setGrid({ ...grid, entry: grid.entry + event.value, notice: false });
    } else if (event.kind === "action" && event.id === "erase") {
      setGrid({ ...grid, entry: grid.entry.slice(0, -1), notice: false });
    } else if (event.kind === "action" && event.id === "primary") {
      submit();
    }
  };

  const rows = useMemo(() => {
    const out: Array<{ letters: string[]; clues: (Clue | "")[] }> = grid.guesses.map((g) => ({
      letters: g.split(""),
      clues: clueGuess(g, grid.target),
    }));
    if (!grid.over) {
      const letters = grid.entry.split("");
      while (letters.length < LENGTH) letters.push("");
      out.push({ letters, clues: Array(LENGTH).fill("") });
    }
    while (out.length < TRIES) {
      out.push({ letters: Array(LENGTH).fill(""), clues: Array(LENGTH).fill("") });
    }
    return out;
  }, [grid.guesses, grid.entry, grid.target, grid.over]);

  const readouts = useMemo(() => [{ labelKey: "game.moves" as const, value: grid.guesses.length }], [grid.guesses.length]);

  const status = grid.over
    ? grid.won
      ? t("game.over")
      : `${t("game.over")} — ${grid.target}`
    : grid.notice
      ? t("game.notInList")
      : t("game.turnToMove", { mark: `${grid.guesses.length + 1}/${TRIES}` });

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <div style={{ display: "grid", gap: 12, justifyItems: "center", width: "100%", maxWidth: 420 }}>
        <p className="game-turn" role={grid.notice ? "status" : undefined}>
          {status}
        </p>
        <div className="game-board" style={{ ["--cols" as string]: LENGTH }} aria-hidden="true">
          {rows.flatMap((row, r) =>
            row.letters.map((letter, c) => (
              <div
                key={`${r}-${c}`}
                className="game-cell"
                data-played={letter !== ""}
                data-win={row.clues[c] === "correct"}
                data-bad={row.clues[c] === "absent" && letter !== ""}
                data-selected={row.clues[c] === "present"}
                style={{ cursor: "default" }}
              >
                {letter}
              </div>
            )),
          )}
        </div>
        {/* The coloured tiles are hidden from assistive tech; this line carries
            the same guesses as plain text instead of colour words. */}
        <p className="sr-only" role="status">
          {grid.guesses.join(", ")}
        </p>
      </div>
    </GameShell>
  );
}
