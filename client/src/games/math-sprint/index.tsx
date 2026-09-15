/**
 * Math Sprint — sixty seconds of arithmetic over the engine keypad.
 *
 * Owns only its content: generated problems (never a negative answer),
 * a three-digit entry, streak scoring, and the countdown. Digits 1–9 and
 * erase come from the engine pad on touch and from the hardware on desktop;
 * the Action button submits on both. Zero is missing from the engine pad, so
 * the board carries its own 0 key beside a full clear — both plain buttons,
 * keyboard reachable by Tab like every other control here.
 */
import { useMemo, useState } from "react";
import { GameShell, useGameInterval, useGameSession, type ControlSpec, type GameEvent } from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: ["primary", "erase"], surface: "board", keypad: true };

const ROUND_SECONDS = 60;
const MAX_ENTRY = 3;

export type Problem = { text: string; answer: number };

/** Small sums, no-negative differences, single-digit products. Pure. */
export function makeProblem(random: () => number = Math.random): Problem {
  const kind = Math.floor(random() * 3);
  if (kind === 0) {
    const a = 2 + Math.floor(random() * 49);
    const b = 2 + Math.floor(random() * 49);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  if (kind === 1) {
    const a = 5 + Math.floor(random() * 45);
    const b = 2 + Math.floor(random() * (a - 1));
    return { text: `${a} − ${b}`, answer: a - b };
  }
  const a = 2 + Math.floor(random() * 8);
  const b = 2 + Math.floor(random() * 8);
  return { text: `${a} × ${b}`, answer: a * b };
}

type SprintState = {
  problem: Problem;
  entry: string;
  correct: number;
  streak: number;
  score: number;
  timeLeft: number;
  flash: "" | "correct" | "wrong";
  /** The answer the last flash refers to — the problem has moved on by then. */
  lastAnswer: number | null;
  over: boolean;
};

const fresh = (): SprintState => ({
  problem: makeProblem(),
  entry: "",
  correct: 0,
  streak: 0,
  score: 0,
  timeLeft: ROUND_SECONDS,
  flash: "",
  lastAnswer: null,
  over: false,
});

export default function MathSprint({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const [quiz, setQuiz] = useState<SprintState>(fresh);

  const session = useGameSession({
    slug,
    onRestart: () => {
      setQuiz(fresh());
    },
  });

  // No timers of our own: the flash clears on the next keypress, so there is
  // nothing to leak on restart, pause, or unmount.
  useGameInterval(session, 1000, () => {
    setQuiz((current) => {
      if (current.over) return current;
      const timeLeft = current.timeLeft - 1;
      if (timeLeft <= 0) {
        const done = { ...current, timeLeft: 0, over: true };
        session.commit({ score: done.score, level: 1, resources: done.correct });
        session.end({ score: done.score, level: 1, resources: done.correct });
        return done;
      }
      return { ...current, timeLeft };
    });
  });

  const typeDigit = (digit: string) => {
    if (session.phase !== "playing" || quiz.over) return;
    if (quiz.entry.length >= MAX_ENTRY) return;
    if (quiz.entry === "" && digit === "0") return;
    setQuiz({ ...quiz, entry: quiz.entry + digit, flash: "" });
  };

  const eraseOne = () => {
    if (session.phase !== "playing" || quiz.over) return;
    setQuiz({ ...quiz, entry: quiz.entry.slice(0, -1), flash: "" });
  };

  const submit = () => {
    if (session.phase !== "playing" || quiz.over || quiz.entry === "") return;
    const right = Number(quiz.entry) === quiz.problem.answer;
    const correct = quiz.correct + (right ? 1 : 0);
    const streak = right ? quiz.streak + 1 : 0;
    const score = quiz.score + (right ? 10 + Math.min(streak, 10) : 0);
    const done: SprintState = {
      problem: makeProblem(),
      entry: "",
      correct,
      streak,
      score,
      timeLeft: quiz.timeLeft,
      flash: right ? "correct" : "wrong",
      lastAnswer: right ? null : quiz.problem.answer,
      over: false,
    };
    setQuiz(done);
    session.commit({ score, level: 1, resources: correct });
  };

  const onEvent = (event: GameEvent) => {
    if (event.kind === "text" && /^[0-9]$/.test(event.value)) typeDigit(event.value);
    else if (event.kind === "action" && event.id === "erase") eraseOne();
    else if (event.kind === "action" && event.id === "primary") submit();
  };

  const readouts = useMemo(
    () => [
      { labelKey: "game.correct" as const, value: quiz.correct },
      { labelKey: "game.streak" as const, value: quiz.streak },
      { labelKey: "game.time" as const, value: quiz.timeLeft },
    ],
    [quiz.correct, quiz.streak, quiz.timeLeft],
  );

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <div className="game-narrow">
        <p className="game-quiz-question" aria-live="off">
          {quiz.problem.text} = ?
        </p>
        <div
          className="game-entry"
          role="status"
          aria-label={quiz.entry === "" ? title : quiz.entry}
          data-correct={quiz.flash === "correct"}
          data-wrong={quiz.flash === "wrong"}
        >
          {quiz.entry === "" ? "–" : quiz.entry}
        </div>
        <div className="game-mode-row">
          <button type="button" className="game-column-pick game-pick-wide" onClick={() => typeDigit("0")}>
            0
          </button>
          <button type="button" className="game-column-pick" style={{ padding: "0 22px" }} onClick={eraseOne} aria-label={t("control.erase")}>
            ⌫
          </button>
          <button type="button" className="game-column-pick" style={{ padding: "0 22px" }} onClick={submit} aria-label={t("control.primary")}>
            <span aria-hidden="true">↵</span>
          </button>
        </div>
        {quiz.flash !== "" && (
          <p className="game-turn" role="status">
            {quiz.flash === "correct" ? t("game.correct") : `${t("game.wrong")} — ${quiz.lastAnswer ?? ""}`}
          </p>
        )}
      </div>
    </GameShell>
  );
}
