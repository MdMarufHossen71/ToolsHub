/** Large high-contrast QR frame renderer: matrix drawn straight to canvas. */
import { useEffect, useRef, useState } from "react";

type QrGenerator = {
  addData: (data: string) => void;
  make: () => void;
  getModuleCount: () => number;
  isDark: (row: number, col: number) => boolean;
};

async function loadQrGenerator(): Promise<(typeNumber: number, errorLevel: string) => QrGenerator> {
  const mod = (await import("qrcode-generator")) as unknown as
    | { default: (typeNumber: number, errorLevel: string) => QrGenerator }
    | ((typeNumber: number, errorLevel: string) => QrGenerator);
  return typeof mod === "function" ? mod : mod.default;
}

export function QrCanvas({ text, size = 320 }: { text: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || !text) return;
    setFailed(false);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setFailed(true);
      return;
    }
    // White background first: scanners need a quiet zone, not transparency.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    void loadQrGenerator()
      .then((qrcode) => {
        if (cancelled) return;
        // typeNumber 0 = auto version, EC level M favours reliability over density.
        const qr = qrcode(0, "M");
        qr.addData(text);
        qr.make();
        const count = qr.getModuleCount();
        const quiet = 2;
        const cell = size / (count + quiet * 2);
        ctx.fillStyle = "#000000";
        for (let row = 0; row < count; row += 1) {
          for (let col = 0; col < count; col += 1) {
            if (qr.isDark(row, col)) {
              ctx.fillRect(Math.floor((col + quiet) * cell), Math.floor((row + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
            }
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        // A canvas-drawn message is invisible to assistive tech and unstyled;
        // surface a real, readable failure next to the frame instead.
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [text, size]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ width: `min(${size}px, 78vw)`, height: "auto", background: "#fff", borderRadius: 12 }}
        role="img"
        aria-label="QR transfer frame"
      />
      {failed && (
        <p className="tool-note tool-note-warning" role="alert">
          This frame could not be drawn. Shorten the file or try a smaller chunk size.
        </p>
      )}
    </>
  );
}
