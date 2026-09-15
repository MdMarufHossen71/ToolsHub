/** Reaction time: wait for green, then tap. Too soon restarts the wait. */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/AppSettingsContext";

type Phase = "idle" | "waiting" | "ready" | "done";

export function ReactionTest() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [best, setBest] = useState<number | null>(null);
  const timer = useRef(0);
  const greenAt = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const press = () => {
    if (phase === "idle" || phase === "done") {
      setMessage("");
      setPhase("waiting");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        greenAt.current = performance.now();
        setPhase("ready");
      }, 1200 + Math.random() * 2800);
      return;
    }
    if (phase === "waiting") {
      window.clearTimeout(timer.current);
      setMessage(t("tool.live.tooSoon"));
      setPhase("idle");
      return;
    }
    const ms = Math.round(performance.now() - greenAt.current);
    setBest((current) => (current === null || ms < current ? ms : current));
    setMessage(`${ms} ms`);
    setPhase("done");
  };

  const label =
    phase === "idle" ? t("game.start") : phase === "waiting" ? t("tool.live.wait") : phase === "ready" ? t("tool.live.tapNow") : message;

  return (
    <div className="live-stage">
      <p className="form-hint">{phase === "idle" || phase === "done" ? t("game.start") : phase === "waiting" ? t("tool.live.wait") : t("tool.live.tapNow")}</p>
      <button
        type="button"
        onClick={press}
        aria-live="polite"
        aria-label={phase === "ready" ? t("tool.live.tapNow") : t("tool.live.wait")}
        style={{
          width: "100%",
          maxWidth: 420,
          minHeight: 220,
          borderRadius: 12,
          border: "1px solid var(--border-strong)",
          background: phase === "ready" ? "var(--primary)" : phase === "waiting" ? "var(--danger)" : "var(--surface-raised)",
          color: phase === "idle" ? "var(--foreground)" : "var(--primary-foreground)",
          font: "700 22px/1.3 var(--font-ui)",
          cursor: "pointer",
          touchAction: "manipulation",
        }}
      >
        {label}
      </button>
      <p className="game-turn" role="status">
        {t("game.best")}: {best === null ? "—" : `${best} ms`}
      </p>
    </div>
  );
}
