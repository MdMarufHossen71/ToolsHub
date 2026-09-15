/** Favicon generator: glyph or emoji in, multi-size PNG set out. */
import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/contexts/AppSettingsContext";

const SIZES = [16, 32, 48, 180];

export function FaviconGen() {
  const { t } = useTranslation();
  const [text, setText] = useState("🚀");
  const [background, setBackground] = useState("#3264ff");
  const [urls, setUrls] = useState<string[]>([]);

  const render = () => {
    const glyph = text.trim().slice(0, 4) || "•";
    const out: string[] = [];
    for (const size of SIZES) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = background;
      const radius = Math.round(size * 0.22);
      context.beginPath();
      context.roundRect(0, 0, size, size, radius);
      context.fill();
      context.fillStyle = "#ffffff";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `${Math.round(size * 0.58)}px sans-serif`;
      context.fillText(glyph, size / 2, size * 0.54);
      out.push(canvas.toDataURL("image/png"));
    }
    setUrls(out);
  };

  return (
    <div className="live-stage">
      <div className="favicon-row">
        {urls.length > 0 ? (
          urls.map((url, i) => <img key={url} src={url} alt={`${SIZES[i]}px`} width={SIZES[i] <= 48 ? SIZES[i] : 64} height={SIZES[i] <= 48 ? SIZES[i] : 64} />)
        ) : (
          <p className="form-hint">{t("tool.live.emoji")}</p>
        )}
      </div>
      <div className="tool-form favicon-form">
        <label className="tool-field">
          <span>{t("tool.live.emoji")}</span>
          <Input value={text} maxLength={4} onChange={(event) => setText(event.target.value)} aria-label={t("tool.live.emoji")} />
        </label>
        <label className="tool-field">
          <span>{t("appearance.tokenBackground")}</span>
          <input type="color" value={background} onChange={(event) => setBackground(event.target.value)} aria-label={t("appearance.tokenBackground")} />
        </label>
      </div>
      <div className="bench-actions bench-actions-center">
        <Button size="sm" onClick={render}>
          {t("tool.run")}
        </Button>
        {urls.map((url, i) => (
          <a key={url} href={url} download={`favicon-${SIZES[i]}.png`} rel="noopener" className="favicon-download" aria-label={`${t("common.download")} ${SIZES[i]}`}>
            <Download className="size-3.5" aria-hidden="true" />
            <span aria-hidden="true">{SIZES[i]}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
