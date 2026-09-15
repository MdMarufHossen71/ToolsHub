/** Fullscreen dead-pixel test: solid fields cycled by tap, Esc leaves. */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/AppSettingsContext";

const FIELDS = ["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000"];

export function PixelTest() {
  const { t } = useTranslation();
  const [index, setIndex] = useState(-1);

  const leave = useCallback(() => {
    setIndex(-1);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (index < 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") leave();
      else setIndex((i) => (i + 1) % FIELDS.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, leave]);

  useEffect(() => () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  if (index < 0) {
    return (
      <div className="live-stage">
        <p className="form-hint">{t("tool.live.fullscreenNote")}</p>
        <div className="bench-actions bench-actions-center">
          <Button
            size="sm"
            onClick={() => {
              setIndex(0);
              void document.documentElement.requestFullscreen?.().catch(() => undefined);
            }}
          >
            {t("game.fullscreen")}
          </Button>
        </div>
      </div>
    );
  }

  // The label names the live action (which colour is showing, tap advances);
  // leaving is always Esc, announced in the idle hint above.
  return (
    <button
      type="button"
      onClick={() => setIndex((i) => (i + 1) % FIELDS.length)}
      aria-label={`${FIELDS[index]} — ${t("tool.live.tapNow")}`}
      style={{ background: FIELDS[index] }}
      className="pixel-field"
    />
  );
}
