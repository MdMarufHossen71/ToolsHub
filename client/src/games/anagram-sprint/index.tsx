/**
 * Anagram Sprint — sixty seconds of unjumbling against the clock.
 *
 * Owns only its content and timing: a curated word list, a scramble that is
 * never the word itself, streak scoring, and the countdown. Letters arrive
 * as `text` from typing or the on-screen pad; Action submits, the secondary
 * button skips to a fresh jumble, erase deletes. No timers of our own — the
 * flash clears on the next keypress, so restart and pause leak nothing.
 */
import { useMemo, useState } from "react";
import { GameShell, useGameInterval, useGameSession, type ControlSpec, type GameEvent } from "@/games/engine";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: ["primary", "secondary", "erase"], surface: "board", letters: true };

const ROUND_SECONDS = 60;
const MIN_LENGTH = 5;

export const WORDS = [
  "PLANET", "GARDEN", "BRIDGE", "MARKET", "PENCIL", "TIGER", "CLOUD", "DANCE",
  "EAGLE", "FOREST", "GUITAR", "HORSE", "JUNGLE", "LEMON", "MANGO", "NIGHT",
  "OCEAN", "PIANO", "QUEEN", "RIVER", "ROBOT", "SNAKE", "TRAIN", "VIOLIN",
  "WHALE", "WINDOW", "WATER", "LIGHT", "STONE", "MOUSE", "BREAD", "CHAIR",
  "TABLE", "PHONE", "CLOCK", "DRUM", "EARTH", "FLAME", "GLOBE", "HEART",
  "APPLE", "TRAIL", "BEACH", "SMILE", "MUSIC", "DREAM", "LAUGH", "STORM",
  "FIELD", "BIRD", "HOUSE", "MONEY", "PARTY", "SHIRT", "SWEET", "THANK",
];

/** A scramble that differs from the word. Pure. */
export function scramble(word: string, random: () => number = Math.random): string {
  const letters = word.split("");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const out = letters.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const a = out[i];
      const b = out[j];
      // Loop-bounded on both sides; the guard is type-level only.
      if (a === undefined || b === undefined) continue;
      out[i] = b;
      out[j] = a;
    }
    if (out.join("") !== word) return out.join("");
  }
  return letters.reverse().join("");
}

export function pickWord(random: () => number = Math.random): string {
  const long = WORDS.filter((w) => w.length >= MIN_LENGTH);
  // The static bank always has long words; the fallback below is type-level only.
  return long[Math.floor(random() * long.length)] ?? "";
}

type SprintState = {
  word: string;
  jumble: string;
  entry: string;
  solved: number;
  streak: number;
  score: number;
  timeLeft: number;
  flash: "" | "correct" | "wrong";
  over: boolean;
};

const fresh = (): SprintState => {
  const word = pickWord();
  return { word, jumble: scramble(word), entry: "", solved: 0, streak: 0, score: 0, timeLeft: ROUND_SECONDS, flash: "", over: false };
};

export default function AnagramSprint({ slug, title }: GameModuleProps) {
  const { t } = useTranslation();
  const [quiz, setQuiz] = useState<SprintState>(fresh);

  const session = useGameSession({
    slug,
    onRestart: () => {
      setQuiz(fresh());
    },
  });

  useGameInterval(session, 1000, () => {
    setQuiz((current) => {
      if (current.over) return current;
      const timeLeft = current.timeLeft - 1;
      if (timeLeft <= 0) {
        const done = { ...current, timeLeft: 0, over: true };
        session.commit({ score: done.score, level: 1, resources: done.solved });
        session.end({ score: done.score, level: 1, resources: done.solved });
        return done;
      }
      return { ...current, timeLeft };
    });
  });

  const submit = () => {
    if (session.phase !== "playing" || quiz.over || quiz.entry === "") return;
    if (quiz.entry === quiz.word) {
      const solved = quiz.solved + 1;
      const streak = quiz.streak + 1;
      const score = quiz.score + 100 + Math.min(streak - 1, 5) * 10;
      const word = pickWord();
      setQuiz({ ...quiz, word, jumble: scramble(word), entry: "", solved, streak, score, flash: "correct" });
      session.commit({ score, level: 1, resources: solved });
      return;
    }
    setQuiz({ ...quiz, streak: 0, flash: "wrong" });
  };

  const skip = () => {
    if (session.phase !== "playing" || quiz.over) return;
    const word = pickWord();
    setQuiz({ ...quiz, word, jumble: scramble(word), entry: "", streak: 0, flash: "" });
  };

  const onEvent = (event: GameEvent) => {
    if (quiz.over || session.phase !== "playing") return;
    if (event.kind === "text" && /^[A-Z]$/.test(event.value)) {
      if (quiz.entry.length < 9) setQuiz({ ...quiz, entry: quiz.entry + event.value, flash: "" });
    } else if (event.kind === "action" && event.id === "erase") {
      setQuiz({ ...quiz, entry: quiz.entry.slice(0, -1), flash: "" });
    } else if (event.kind === "action" && event.id === "primary") {
      submit();
    } else if (event.kind === "action" && event.id === "secondary") {
      skip();
    }
  };

  const readouts = useMemo(
    () => [
      { labelKey: "game.words" as const, value: quiz.solved },
      { labelKey: "game.streak" as const, value: quiz.streak },
      { labelKey: "game.time" as const, value: quiz.timeLeft },
    ],
    [quiz.solved, quiz.streak, quiz.timeLeft],
  );

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} onEvent={onEvent}>
      <div style={{ display: "grid", gap: 12, justifyItems: "center", width: "100%", maxWidth: 560 }}>
        <p className="game-jumble" aria-label={quiz.jumble.split("").join(" ")}>
          {quiz.jumble}
        </p>
        <div className="game-entry" role="status" aria-label={quiz.entry === "" ? title : quiz.entry}>
          {quiz.entry === "" ? "–" : quiz.entry}
        </div>
        {quiz.flash !== "" && (
          <p className="game-turn" role="status">
            {quiz.flash === "correct" ? t("game.correct") : t("game.wrong")}
          </p>
        )}
      </div>
    </GameShell>
  );
}
