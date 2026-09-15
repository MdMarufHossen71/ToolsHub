/** Typing speed test: type the passage, get WPM + accuracy live. */
import { useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/AppSettingsContext";

const PASSAGES = [
  "The quick brown fox jumps over the lazy dog near the quiet river bank.",
  "Dhaka wakes early; rickshaw bells ring through the morning mist.",
  "A careful coder writes small functions and tests every branch.",
  "Monsoon clouds gather over the padma as the boats head home.",
];

export function TypingTest() {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  // Four passages by construction; the fallback below is type-level only.
  const target = PASSAGES[index % PASSAGES.length] ?? "";
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const correct = useMemo(() => {
    let n = 0;
    for (let i = 0; i < Math.min(typed.length, target.length); i += 1) {
      if (typed[i] === target[i]) n += 1;
    }
    return n;
  }, [typed, target]);

  const minutes = startedAt === null ? 0 : ((finishedAt ?? Date.now()) - startedAt) / 60000;
  const wpm = minutes > 0 && typed.length > 0 ? Math.round(correct / 5 / minutes) : 0;
  const accuracy = typed.length === 0 ? 100 : Math.round((correct / typed.length) * 100);

  const reset = (next?: number) => {
    setIndex(next ?? index + 1);
    setTyped("");
    setStartedAt(null);
    setFinishedAt(null);
    areaRef.current?.focus();
  };

  return (
    <div className="live-stage">
      {/* Reset advances to the next passage, so the counter says which one this is. */}
      <p className="form-hint">
        {t("tool.live.text")} {(index % PASSAGES.length) + 1} / {PASSAGES.length}
      </p>
      <p className="tool-output" aria-label={target}>
        {target.split("").map((char, i) => (
          <span
            key={i}
            className={
              i >= typed.length ? undefined : typed[i] === char ? "typing-correct" : "typing-wrong"
            }
          >
            {char}
          </span>
        ))}
      </p>
      <textarea
        ref={areaRef}
        value={typed}
        onChange={(event) => {
          const value = event.target.value.slice(0, target.length);
          if (startedAt === null && value.length > 0) setStartedAt(Date.now());
          setTyped(value);
          if (value === target) setFinishedAt(Date.now());
        }}
        className="tool-textarea tool-textarea-short"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={t("tool.live.text")}
      />
      <p className="game-turn" role="status">
        {t("tool.live.wpm")}: {wpm} · {t("tool.live.accuracy")}: {accuracy}%
      </p>
      <div className="bench-actions">
        <Button variant="ghost" size="sm" onClick={() => reset()}>
          <RotateCcw className="mr-2 size-3.5" aria-hidden="true" />
          {t("common.reset")}
        </Button>
      </div>
    </div>
  );
}
