/**
 * Geo Quiz — ten capitals against a sixty-second clock, native DOM buttons.
 *
 * Owns only its content and timing: a curated capital bank (proper nouns, so
 * the questions read identically in both languages), shuffled order and
 * options each round, a streak bonus, and a lock-out flash on every answer.
 * The choices are real buttons — Tab and Enter work natively, touch taps
 * directly — so the engine contributes no extra controls here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { GameShell, useGameInterval, useGameSession, type ControlSpec } from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: [], surface: "board" };

const QUESTIONS_PER_ROUND = 10;
const ROUND_SECONDS = 60;
const FLASH_MS = 450;

type Question = { country: string; capital: string; options: string[] };

/** Curated bank: each row is country, capital, three plausible distractors. */
const BANK: Array<[string, string, string, string, string]> = [
  ["Japan", "Tokyo", "Kyoto", "Osaka", "Beijing"],
  ["France", "Paris", "Lyon", "Madrid", "Rome"],
  ["Egypt", "Cairo", "Alexandria", "Amman", "Tunis"],
  ["Brazil", "Brasília", "Rio de Janeiro", "Lima", "Bogotá"],
  ["Canada", "Ottawa", "Toronto", "Vancouver", "Calgary"],
  ["Australia", "Canberra", "Sydney", "Melbourne", "Perth"],
  ["India", "New Delhi", "Mumbai", "Kolkata", "Dhaka"],
  ["Italy", "Rome", "Milan", "Naples", "Venice"],
  ["Spain", "Madrid", "Barcelona", "Lisbon", "Seville"],
  ["Germany", "Berlin", "Munich", "Hamburg", "Vienna"],
  ["Bangladesh", "Dhaka", "Chittagong", "Kolkata", "Kathmandu"],
  ["Nepal", "Kathmandu", "Pokhara", "Thimphu", "Dhaka"],
  ["Thailand", "Bangkok", "Phuket", "Hanoi", "Manila"],
  ["Turkey", "Ankara", "Istanbul", "Athens", "Izmir"],
  ["Russia", "Moscow", "Kyiv", "Minsk", "Kazan"],
  ["China", "Beijing", "Shanghai", "Seoul", "Tokyo"],
  ["South Korea", "Seoul", "Busan", "Osaka", "Taipei"],
  ["Saudi Arabia", "Riyadh", "Jeddah", "Dubai", "Doha"],
  ["Kenya", "Nairobi", "Mombasa", "Kampala", "Addis Ababa"],
  ["Argentina", "Buenos Aires", "Córdoba", "Santiago", "Montevideo"],
  ["Mexico", "Mexico City", "Cancún", "Guadalajara", "Havana"],
  ["United States", "Washington, D.C.", "New York", "Los Angeles", "Chicago"],
  ["United Kingdom", "London", "Manchester", "Dublin", "Edinburgh"],
  ["Indonesia", "Jakarta", "Bali", "Surabaya", "Kuala Lumpur"],
];

function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    // Loop-bounded on both sides; the guard is type-level only.
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** A round: shuffled questions, shuffled options. Pure. */
export function dealRound(random: () => number = Math.random): Question[] {
  return shuffle(BANK, random)
    .slice(0, QUESTIONS_PER_ROUND)
    .map(([country, capital, ...rest]) => ({
      country,
      capital,
      options: shuffle([capital, ...rest], random),
    }));
}

type QuizState = {
  questions: Question[];
  index: number;
  correct: number;
  streak: number;
  bestStreak: number;
  score: number;
  timeLeft: number;
  lock: "" | "correct" | "wrong";
  over: boolean;
};

const fresh = (): QuizState => ({
  questions: dealRound(),
  index: 0,
  correct: 0,
  streak: 0,
  bestStreak: 0,
  score: 0,
  timeLeft: ROUND_SECONDS,
  lock: "",
  over: false,
});

export default function GeoQuiz({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const [quiz, setQuiz] = useState<QuizState>(fresh);
  const generation = useRef(0);
  const timer = useRef(0);

  const session = useGameSession({
    slug,
    onRestart: () => {
      generation.current += 1;
      window.clearTimeout(timer.current);
      setQuiz(fresh());
    },
  });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // The clock runs only while the session runs: pausing or hiding the tab
  // freezes the countdown through `useGameInterval`, with nothing to clean up.
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

  const answer = (option: string) => {
    if (session.phase !== "playing" || quiz.over || quiz.lock !== "") return;
    const current = quiz.questions[quiz.index];
    // The index is always a live question while playing; type-level only.
    if (!current) return;
    const right = option === current.capital;
    const correct = quiz.correct + (right ? 1 : 0);
    const streak = right ? quiz.streak + 1 : 0;
    const score = quiz.score + (right ? 100 + Math.min(streak - 1, 5) * 10 : 0);
    const round = generation.current;
    setQuiz({ ...quiz, correct, streak, bestStreak: Math.max(quiz.bestStreak, streak), score, lock: right ? "correct" : "wrong" });
    session.commit({ score, level: 1, resources: correct });
    timer.current = window.setTimeout(() => {
      if (generation.current !== round) return;
      setQuiz((latest) => {
        if (latest.index + 1 >= latest.questions.length) {
          const done = { ...latest, lock: "" as const, over: true };
          session.end({ score: done.score, level: 1, resources: done.correct });
          return done;
        }
        return { ...latest, index: latest.index + 1, lock: "" as const };
      });
    }, FLASH_MS);
  };

  // Questions are always dealt (non-empty bank); the fallback renders an empty
  // card instead of crashing if that ever stopped holding.
  const emptyQuestion: Question = { country: "", capital: "", options: [] };
  const question = quiz.questions[Math.min(quiz.index, quiz.questions.length - 1)] ?? emptyQuestion;

  const readouts = useMemo(
    () => [
      { labelKey: "game.correct" as const, value: quiz.correct },
      { labelKey: "game.time" as const, value: quiz.timeLeft },
    ],
    [quiz.correct, quiz.timeLeft],
  );

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={() => undefined}>
      <div className="game-narrow game-narrow-stretch">
        <p className="game-turn" role="status">
          {t("game.question")} {Math.min(quiz.index + 1, QUESTIONS_PER_ROUND)}/{QUESTIONS_PER_ROUND}
        </p>
        <p className="game-quiz-question">{question.country}?</p>
        <div className="game-choice-list">
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              className="game-choice"
              data-correct={quiz.lock !== "" && option === question.capital}
              disabled={quiz.over || quiz.lock !== ""}
              onClick={() => answer(option)}
            >
              {option}
            </button>
          ))}
        </div>
        {quiz.lock !== "" && (
          <p className="game-turn" role="status">
            {quiz.lock === "correct" ? t("game.correct") : `${t("game.wrong")} — ${question.capital}`}
          </p>
        )}
      </div>
    </GameShell>
  );
}
