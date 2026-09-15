/** Spinning wheels: decision wheel (yes/no/maybe…) and the custom list wheel. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { beep } from "./useLive";

const WHEEL_COLORS = ["#3264ff", "#22d3ee", "#ff6b4a", "#ffd166", "#06d6a0", "#8b5cf6", "#f7f6f1", "#ef476f"];

/** Winner index after a fair spin. Pure, so the fairness is testable. */
export function spinIndex(count: number, random: () => number = Math.random): number {
  return Math.floor(random() * count) % Math.max(1, count);
}

function Wheel({ options, onDone }: { options: string[]; onDone: (winner: string) => void }) {
  const { t } = useTranslation();
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const slices = useMemo(
    () =>
      options.map((label, i) => {
        const start = (i / options.length) * Math.PI * 2;
        const end = ((i + 1) / options.length) * Math.PI * 2;
        return { label, start, end, color: WHEEL_COLORS[i % WHEEL_COLORS.length] };
      }),
    [options],
  );

  const spin = () => {
    if (spinning || options.length === 0) return;
    setSpinning(true);
    setWinner(null);
    const target = angle + Math.PI * (6 + Math.random() * 6);
    const started = performance.now();
    const duration = 2200;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAngle(angle + (target - angle) * eased);
      if (progress < 1) {
        raf.current = requestAnimationFrame(tick);
        return;
      }
      // Pointer at the top: which slice sits under it now.
      const pointer = ((Math.PI * 1.5 - target) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const index = Math.floor((pointer / (Math.PI * 2)) * options.length) % options.length;
      const won = options[index];
      // Spin is disabled on an empty wheel, so this is type-level only.
      if (won === undefined) {
        setSpinning(false);
        return;
      }
      setWinner(won);
      setSpinning(false);
      onDone(won);
      beep(660, 0.2);
    };
    raf.current = requestAnimationFrame(tick);
  };

  return (
    <div className="live-stage">
      <svg width="240" height="240" viewBox="0 0 240 240" role="img" aria-label={t("tool.live.spin")} style={{ maxWidth: "100%", height: "auto" }}>
        <g transform={`rotate(${(angle * 180) / Math.PI} 120 120)`}>
          {slices.map((slice, i) => {
            const large = slice.end - slice.start > Math.PI ? 1 : 0;
            const x1 = 120 + 110 * Math.cos(slice.start);
            const y1 = 120 + 110 * Math.sin(slice.start);
            const x2 = 120 + 110 * Math.cos(slice.end);
            const y2 = 120 + 110 * Math.sin(slice.end);
            return <path key={`${i}-${slice.label}`} d={`M120 120 L${x1} ${y1} A110 110 0 ${large} 1 ${x2} ${y2} Z`} fill={slice.color} stroke="var(--background)" strokeWidth="2" />;
          })}
        </g>
        <polygon points="120,2 112,18 128,18" fill="var(--foreground)" />
        <circle cx="120" cy="120" r="10" fill="var(--background)" stroke="var(--foreground)" strokeWidth="2" />
      </svg>
      <div className="bench-actions">
        <Button size="sm" disabled={spinning || options.length === 0} onClick={spin}>
          {t("tool.live.spin")}
        </Button>
      </div>
      {winner && (
        <p className="game-turn" role="status">
          {t("tool.live.winner")}: {winner}
        </p>
      )}
    </div>
  );
}

export function DecisionWheel({ onDone }: { onDone: (winner: string) => void }) {
  const { language } = useTranslation();
  const options = language === "bn" ? ["হ্যাঁ", "না", "আবার ভাবুন", "অবশ্যই", "পরে"] : ["Yes", "No", "Think again", "Definitely", "Later"];
  return <Wheel options={options} onDone={onDone} />;
}

export function ListWheelPicker() {
  const { t } = useTranslation();
  const [text, setText] = useState("Amina\nRahim\nSadia\nKarim");
  const [round, setRound] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);
  const options = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  return (
    <div className="live-stage">
      <label className="tool-field tool-field-wide">
        <span>{t("tool.live.options")}</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} className="tool-textarea tool-textarea-short" spellCheck={false} aria-label={t("tool.live.options")} />
      </label>
      {text.split("\n").filter((s) => s.trim()).length > 12 && <p className="form-hint">12 / 12</p>}
      <Wheel
        key={round}
        options={options.length > 0 ? options : ["—"]}
        onDone={(won) => {
          setWinner(won);
          setRound((r) => r + 1);
        }}
      />
      {winner && options.length > 0 && (
        <p className="game-turn" role="status">
          {t("tool.live.winner")}: {winner}
        </p>
      )}
    </div>
  );
}
