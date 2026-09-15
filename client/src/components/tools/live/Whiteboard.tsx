/** Whiteboard: finger/mouse sketching with clear and PNG download. */
import { useEffect, useRef, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/AppSettingsContext";

export function Whiteboard() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [strokes, setStrokes] = useState(0);

  // Sized once on mount: re-fitting on resize would wipe the sketch, so the
  // canvas keeps its pixels and the page scrolls around it instead.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const size = Math.min(parent?.clientWidth ?? 560, 560);
    canvas.width = size;
    canvas.height = Math.round(size * 0.6);
  }, []);

  const position = (event: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setStrokes(0);
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = "whiteboard.png";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <div className="live-stage">
      <canvas
        ref={canvasRef}
        aria-label={t("tool.live.board")}
        role="img"
        onPointerDown={(event) => {
          const canvas = canvasRef.current;
          const context = canvas?.getContext("2d");
          if (!canvas || !context) return;
          drawing.current = true;
          canvas.setPointerCapture?.(event.pointerId);
          const { x, y } = position(event);
          context.strokeStyle = getComputedStyle(canvas).color;
          context.lineWidth = 3;
          context.lineCap = "round";
          context.beginPath();
          context.moveTo(x, y);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const canvas = canvasRef.current;
          const context = canvas?.getContext("2d");
          if (!canvas || !context) return;
          const { x, y } = position(event);
          context.lineTo(x, y);
          context.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          setStrokes((s) => s + 1);
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
        className="whiteboard-canvas"
      />
      {strokes === 0 && <p className="form-hint">{t("tool.live.drawHint")}</p>}
      <div className="bench-actions bench-actions-center">
        <Button variant="ghost" size="sm" onClick={clear}>
          <RotateCcw className="mr-2 size-3.5" aria-hidden="true" />
          {t("common.clear")}
        </Button>
        <Button variant="outline" size="sm" onClick={download} disabled={strokes === 0}>
          <Download className="mr-2 size-3.5" aria-hidden="true" />
          {t("common.download")}
        </Button>
      </div>
    </div>
  );
}
