/** Screen ruler: a measuring overlay with live pixel readout. */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/AppSettingsContext";

export function ScreenRuler() {
  const { t } = useTranslation();
  const [measuring, setMeasuring] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [locked, setLocked] = useState(false);
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    setDpr(window.devicePixelRatio || 1);
  }, []);

  useEffect(() => {
    if (!measuring) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMeasuring(false);
        setStart(null);
        setEnd(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [measuring]);

  const distance = start && end ? Math.round(Math.hypot(end.x - start.x, end.y - start.y)) : 0;

  return (
    <div className="live-stage">
      <p className="live-readout" role="status">
        {Math.round(distance * dpr)}px
      </p>
      <p className="live-subreadout">
        {distance}px · ×{dpr}
      </p>
      {!measuring && <p className="form-hint">{t("tool.live.dragHint")}</p>}
      <div className="bench-actions bench-actions-center">
        <Button size="sm" onClick={() => setMeasuring((m) => !m)}>
          {measuring ? t("common.close") : t("tool.live.measure")}
        </Button>
      </div>
      {measuring && (
        <div
          role="application"
          aria-label={t("tool.live.ruler")}
          onPointerDown={(event) => {
            (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
            setLocked(false);
            setStart({ x: event.clientX, y: event.clientY });
            setEnd({ x: event.clientX, y: event.clientY });
          }}
          onPointerMove={(event) => {
            if (start && !locked) setEnd({ x: event.clientX, y: event.clientY });
          }}
          // Releasing the pointer locks the measurement so the line stays put
          // for reading; Esc or Close clears it.
          onPointerUp={() => setLocked(true)}
          className="ruler-overlay"
        >
          {start && end && (
            <svg className="ruler-canvas" aria-hidden="true">
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="var(--primary)" strokeWidth="2" />
              <circle cx={start.x} cy={start.y} r="4" fill="var(--primary)" />
              <circle cx={end.x} cy={end.y} r="4" fill="var(--primary)" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
