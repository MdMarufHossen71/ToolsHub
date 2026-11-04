/** Small browser-local particle animation with live controls and a copyable config. */
import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/AppSettingsContext";

type Particle = { x: number; y: number; vx: number; vy: number };

export function ParticlesPlayground() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(48);
  const [speed, setSpeed] = useState(0.8);
  const [size, setSize] = useState(2);
  const [color, setColor] = useState("#54d6c8");
  const [links, setLinks] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const parent = canvas?.parentElement;
    if (!canvas || !context || !parent) return;

    let width = Math.max(280, parent.getBoundingClientRect().width);
    let height = 260;
    const particles: Particle[] = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.35 + Math.random() * 0.65);
      return { x: Math.random() * width, y: Math.random() * height, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity };
    });

    let frame = 0;
    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(280, rect.width);
      height = 260;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles.forEach((particle) => { particle.x = Math.min(particle.x, width); particle.y = Math.min(particle.y, height); });
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(parent);
    resize();

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#07111f";
      context.fillRect(0, 0, width, height);
      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < 0 || particle.x > width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > height) particle.vy *= -1;
        particle.x = Math.max(0, Math.min(width, particle.x));
        particle.y = Math.max(0, Math.min(height, particle.y));
      }
      if (links) {
        const maxDistance = 112;
        for (let i = 0; i < particles.length; i += 1) {
          const a = particles[i];
          if (!a) continue;
          for (let j = i + 1; j < particles.length; j += 1) {
            const b = particles[j];
            if (!b) continue;
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (distance < maxDistance) {
              context.globalAlpha = (1 - distance / maxDistance) * 0.35;
              context.strokeStyle = color;
              context.lineWidth = 1;
              context.beginPath();
              context.moveTo(a.x, a.y);
              context.lineTo(b.x, b.y);
              context.stroke();
            }
          }
        }
        context.globalAlpha = 1;
      }
      context.fillStyle = color;
      for (const particle of particles) {
        context.beginPath();
        context.arc(particle.x, particle.y, size, 0, Math.PI * 2);
        context.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [color, count, links, size, speed]);

  const copyConfig = async () => {
    const config = {
      particles: {
        number: { value: count },
        color: { value: color },
        shape: { type: "circle" },
        size: { value: size },
        move: { enable: true, speed },
        lineLinked: { enable: links, distance: 112 },
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setNotice(t("tool.copied"));
    } catch {
      setNotice(t("tool.copyFailed"));
    }
  };

  return (
    <div className="live-stage live-stage-stretch">
      <canvas ref={canvasRef} className="particle-preview" role="img" aria-label={t("tool.live.particlesPreview")} />
      <div className="particle-controls">
        <label className="tool-range-row">
          <span>{t("tool.live.particleCount")}: {count}</span>
          <input type="range" min="10" max="110" step="1" value={count} onChange={(event) => setCount(Number(event.target.value))} aria-label={t("tool.live.particleCount")} />
        </label>
        <label className="tool-range-row">
          <span>{t("tool.live.particleSpeed")}: {speed.toFixed(1)}</span>
          <input type="range" min="0.2" max="2.5" step="0.1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label={t("tool.live.particleSpeed")} />
        </label>
        <label className="tool-range-row">
          <span>{t("tool.live.particleSize")}: {size.toFixed(1)}</span>
          <input type="range" min="1" max="5" step="0.5" value={size} onChange={(event) => setSize(Number(event.target.value))} aria-label={t("tool.live.particleSize")} />
        </label>
        <label className="particle-color-row">
          <span>{t("tool.live.particleColor")}</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label={t("tool.live.particleColor")} />
        </label>
        <label className="particle-links-row">
          <input type="checkbox" checked={links} onChange={(event) => setLinks(event.target.checked)} />
          <span>{t("tool.live.particleLinks")}</span>
        </label>
      </div>
      <div className="bench-actions bench-actions-center">
        <Button variant="outline" size="sm" onClick={() => void copyConfig()}>
          <Copy className="mr-2 size-3.5" aria-hidden="true" />{t("tool.live.particleCopyConfig")}
        </Button>
      </div>
      {notice && <p className="form-hint" role="status">{notice}</p>}
    </div>
  );
}
