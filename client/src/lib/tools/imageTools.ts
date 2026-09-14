/**
 * Image Studio wave: a small pure-pixel pipeline with a thin canvas shell.
 *
 * All transforms operate on `Pix` (width, height, RGBA bytes) with no DOM, so
 * they are unit-testable in node. Only `loadPix` (decode) and `pixToDataUrl`
 * (encode) touch canvas APIs and fail gracefully outside a browser. Large
 * uploads are capped on decode to keep filters interactive.
 */
import { ToolError, field, type ToolResult, type ToolRunner } from "@/lib/toolOperations";

export type Pix = { width: number; height: number; data: Uint8ClampedArray };

const MAX_DIMENSION = 1920;

const clampByte = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n));

export function blankPix(width: number, height: number, r = 0, g = 0, b = 0, a = 255): Pix {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width, height, data };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const light = (max + min) / 2;
  if (max === min) return [0, 0, light];
  const delta = max - min;
  const sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === rn) hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) hue = ((bn - rn) / delta + 2) / 6;
  else hue = ((rn - gn) / delta + 4) / 6;
  return [hue * 360, sat, light];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [Math.round(channel(hue + 1 / 3) * 255), Math.round(channel(hue) * 255), Math.round(channel(hue - 1 / 3) * 255)];
}

/** Map every pixel through `fn(r,g,b,a)`. Pure. */
export function mapPixels(pix: Pix, fn: (r: number, g: number, b: number, a: number, x: number, y: number) => [number, number, number, number]): Pix {
  const out = new Uint8ClampedArray(pix.data.length);
  for (let y = 0; y < pix.height; y += 1) {
    for (let x = 0; x < pix.width; x += 1) {
      const i = (y * pix.width + x) * 4;
      const [r, g, b, a] = fn(pix.data[i], pix.data[i + 1], pix.data[i + 2], pix.data[i + 3], x, y);
      out[i] = clampByte(r);
      out[i + 1] = clampByte(g);
      out[i + 2] = clampByte(b);
      out[i + 3] = clampByte(a);
    }
  }
  return { width: pix.width, height: pix.height, data: out };
}

/** Bilinear resize. Pure. */
export function resizePix(pix: Pix, width: number, height: number): Pix {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(pix.width - 1, (x / Math.max(1, width - 1)) * (pix.width - 1));
      const sy = Math.min(pix.height - 1, (y / Math.max(1, height - 1)) * (pix.height - 1));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(pix.width - 1, x0 + 1);
      const y1 = Math.min(pix.height - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      for (let c = 0; c < 4; c += 1) {
        const top = pix.data[(y0 * pix.width + x0) * 4 + c] * (1 - fx) + pix.data[(y0 * pix.width + x1) * 4 + c] * fx;
        const bottom = pix.data[(y1 * pix.width + x0) * 4 + c] * (1 - fx) + pix.data[(y1 * pix.width + x1) * 4 + c] * fx;
        out[(y * width + x) * 4 + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { width, height, data: out };
}

/** Crop with clamping. Pure. */
export function cropPix(pix: Pix, x: number, y: number, width: number, height: number): Pix {
  const cx = Math.min(pix.width - 1, Math.max(0, x));
  const cy = Math.min(pix.height - 1, Math.max(0, y));
  const cw = Math.min(pix.width - cx, Math.max(1, width));
  const ch = Math.min(pix.height - cy, Math.max(1, height));
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let row = 0; row < ch; row += 1) {
    for (let col = 0; col < cw; col += 1) {
      for (let c = 0; c < 4; c += 1) out[(row * cw + col) * 4 + c] = pix.data[((cy + row) * pix.width + cx + col) * 4 + c];
    }
  }
  return { width: cw, height: ch, data: out };
}

/** Exact quarter turns plus mirrors. Pure. */
export function rotateFlip(pix: Pix, quarterTurns: number, flip: "none" | "h" | "v"): Pix {
  let current = pix;
  const turns = ((quarterTurns % 4) + 4) % 4;
  for (let t = 0; t < turns; t += 1) {
    const out = new Uint8ClampedArray(current.data.length);
    for (let y = 0; y < current.height; y += 1) {
      for (let x = 0; x < current.width; x += 1) {
        for (let c = 0; c < 4; c += 1) out[(x * current.height + (current.height - 1 - y)) * 4 + c] = current.data[(y * current.width + x) * 4 + c];
      }
    }
    current = { width: current.height, height: current.width, data: out };
  }
  if (flip !== "none") {
    const out = new Uint8ClampedArray(current.data.length);
    for (let y = 0; y < current.height; y += 1) {
      for (let x = 0; x < current.width; x += 1) {
        const sx = flip === "h" ? current.width - 1 - x : x;
        const sy = flip === "v" ? current.height - 1 - y : y;
        for (let c = 0; c < 4; c += 1) out[(y * current.width + x) * 4 + c] = current.data[(sy * current.width + sx) * 4 + c];
      }
    }
    current = { width: current.width, height: current.height, data: out };
  }
  return current;
}

/** Box blur at integer radius. Pure. */
export function blurPix(pix: Pix, radius: number): Pix {
  const r = Math.min(25, Math.max(0, Math.round(radius)));
  if (r === 0) return pix;
  const out = new Uint8ClampedArray(pix.data.length);
  for (let y = 0; y < pix.height; y += 1) {
    for (let x = 0; x < pix.width; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= pix.width || ny < 0 || ny >= pix.height) continue;
          const i = (ny * pix.width + nx) * 4;
          sumR += pix.data[i];
          sumG += pix.data[i + 1];
          sumB += pix.data[i + 2];
          sumA += pix.data[i + 3];
          count += 1;
        }
      }
      const o = (y * pix.width + x) * 4;
      out[o] = Math.round(sumR / count);
      out[o + 1] = Math.round(sumG / count);
      out[o + 2] = Math.round(sumB / count);
      out[o + 3] = Math.round(sumA / count);
    }
  }
  return { width: pix.width, height: pix.height, data: out };
}

/** 3×3 convolution. Pure. */
export function convolve(pix: Pix, kernel: number[], divisor = 1): Pix {
  const out = new Uint8ClampedArray(pix.data.length);
  const at = (x: number, y: number, c: number) => {
    const cx = Math.min(pix.width - 1, Math.max(0, x));
    const cy = Math.min(pix.height - 1, Math.max(0, y));
    return pix.data[(cy * pix.width + cx) * 4 + c];
  };
  for (let y = 0; y < pix.height; y += 1) {
    for (let x = 0; x < pix.width; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) sum += at(x + kx, y + ky, c) * kernel[(ky + 1) * 3 + (kx + 1)];
        }
        out[(y * pix.width + x) * 4 + c] = clampByte(sum / divisor);
      }
      out[(y * pix.width + x) * 4 + 3] = pix.data[(y * pix.width + x) * 4 + 3];
    }
  }
  return { width: pix.width, height: pix.height, data: out };
}

/** Per-channel histogram equalization. Pure. */
export function equalizePix(pix: Pix): Pix {
  const maps: number[][] = [];
  for (let c = 0; c < 3; c += 1) {
    const histogram = new Array(256).fill(0);
    for (let i = c; i < pix.data.length; i += 4) histogram[pix.data[i]] += 1;
    const total = pix.width * pix.height;
    const cdf = new Array(256).fill(0);
    let running = 0;
    for (let v = 0; v < 256; v += 1) {
      running += histogram[v];
      cdf[v] = running;
    }
    const cdfMin = cdf.find((value) => value > 0) ?? 0;
    maps.push(cdf.map((value) => Math.round(((value - cdfMin) / Math.max(1, total - cdfMin)) * 255)));
  }
  return mapPixels(pix, (r, g, b, a) => [maps[0][r], maps[1][g], maps[2][b], a]);
}

/** Sobel edge magnitude. Pure. */
export function edgePix(pix: Pix): Pix {
  const grey = mapPixels(pix, (r, g, b, a) => {
    const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    return [v, v, v, a];
  });
  const gx = convolve(grey, [-1, 0, 1, -2, 0, 2, -1, 0, 1]);
  const gy = convolve(grey, [-1, -2, -1, 0, 0, 0, 1, 2, 1]);
  const out = new Uint8ClampedArray(pix.data.length);
  for (let i = 0; i < pix.data.length; i += 4) {
    const magnitude = Math.min(255, Math.round(Math.hypot(gx.data[i], gy.data[i])));
    out[i] = 255 - magnitude;
    out[i + 1] = 255 - magnitude;
    out[i + 2] = 255 - magnitude;
    out[i + 3] = pix.data[i + 3];
  }
  return { width: pix.width, height: pix.height, data: out };
}

/** Draw `foreground` over `base` at an offset with opacity. Pure. */
export function overlayPix(base: Pix, foreground: Pix, offsetX: number, offsetY: number, opacity: number): Pix {
  const out = new Uint8ClampedArray(base.data);
  const result: Pix = { width: base.width, height: base.height, data: out };
  for (let y = 0; y < foreground.height; y += 1) {
    for (let x = 0; x < foreground.width; x += 1) {
      const tx = x + offsetX;
      const ty = y + offsetY;
      if (tx < 0 || tx >= base.width || ty < 0 || ty >= base.height) continue;
      const s = (y * foreground.width + x) * 4;
      const d = (ty * base.width + tx) * 4;
      const alpha = (foreground.data[s + 3] / 255) * opacity;
      out[d] = Math.round(foreground.data[s] * alpha + out[d] * (1 - alpha));
      out[d + 1] = Math.round(foreground.data[s + 1] * alpha + out[d + 1] * (1 - alpha));
      out[d + 2] = Math.round(foreground.data[s + 2] * alpha + out[d + 2] * (1 - alpha));
    }
  }
  return result;
}

/** Average color plus a tiny quantized palette. Pure. */
export function analyzeColors(pix: Pix, swatches: number): { average: string; palette: string[] } {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const buckets = new Map<number, number>();
  const step = Math.max(1, Math.floor((pix.width * pix.height) / 20000));
  let samples = 0;
  for (let i = 0; i < pix.width * pix.height; i += step) {
    const o = i * 4;
    if (pix.data[o + 3] < 128) continue;
    sumR += pix.data[o];
    sumG += pix.data[o + 1];
    sumB += pix.data[o + 2];
    samples += 1;
    const key = ((pix.data[o] >> 5) << 10) | ((pix.data[o + 1] >> 5) << 5) | (pix.data[o + 2] >> 5);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  const top = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]).slice(0, Math.max(1, swatches));
  return {
    average: samples === 0 ? "#000000" : hex(sumR / samples, sumG / samples, sumB / samples),
    palette: top.map(([key]) => hex(((key >> 10) & 31) * 8 + 4, ((key >> 5) & 31) * 8 + 4, (key & 31) * 8 + 4)),
  };
}

const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
};

/** Decode an image file to pixels, capping huge uploads. Browser only. */
export async function loadPix(file: File): Promise<Pix> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    throw new Error("no-canvas");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no-canvas");
  context.drawImage(bitmap, 0, 0, width, height);
  if (typeof bitmap.close === "function") bitmap.close();
  return { width, height, data: context.getImageData(0, 0, width, height).data as unknown as Uint8ClampedArray };
}

/** Encode pixels to a data URL. Browser only. */
export function pixToDataUrl(pix: Pix, type: "image/png" | "image/jpeg" | "image/webp" = "image/png", quality = 0.92): string {
  if (typeof document === "undefined") throw new Error("no-canvas");
  const canvas = document.createElement("canvas");
  canvas.width = pix.width;
  canvas.height = pix.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no-canvas");
  context.putImageData(new ImageData(new Uint8ClampedArray(pix.data), pix.width, pix.height), 0, 0);
  return canvas.toDataURL(type, quality);
}

function parseHexField(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

export const runImageTools: ToolRunner = async (slug, input, _option, _t, extra) => {
  const F = (key: string, fallback = "") => field(extra, key, fallback);

  const firstPix = async (maxBytes = 25 * 1024 * 1024): Promise<{ pix: Pix; file: File }> => {
    const file = extra?.files?.[0];
    if (!file) throw new ToolError("tool.error.generic");
    if (file.size > maxBytes) throw new ToolError("tool.error.fileTooLarge");
    try {
      return { pix: await loadPix(file), file };
    } catch {
      throw new ToolError("tool.error.generic");
    }
  };

  const finishPix = (pix: Pix, file: File, name: string, type: "image/png" | "image/jpeg" = "image/png", quality = 0.92): ToolResult => {
    const dataUrl = pixToDataUrl(pix, type, quality);
    return {
      text: JSON.stringify({ file: file.name, width: pix.width, height: pix.height, output: name }, null, 2),
      image: dataUrl,
      artifacts: [{ name, mime: type, dataUrl }],
    };
  };

  const num = (key: string, fallback: number, min: number, max: number): number => {
    const n = Number(F(key, String(fallback)));
    if (!Number.isFinite(n)) throw new ToolError("tool.error.number");
    return Math.min(max, Math.max(min, n));
  };

  if (slug === "image-resize") {
    const { pix, file } = await firstPix();
    let width = Math.round(num("width", 800, 0, 1920));
    let height = Math.round(num("height", 0, 0, 1920));
    if (width === 0 && height === 0) {
      width = pix.width;
      height = pix.height;
    } else if (width === 0) {
      width = Math.max(1, Math.round((pix.width * height) / pix.height));
    } else if (height === 0) {
      height = Math.max(1, Math.round((pix.height * width) / pix.width));
    }
    return finishPix(resizePix(pix, width, height), file, `resized-${width}x${height}.png`);
  }
  if (slug === "image-crop") {
    const { pix, file } = await firstPix();
    return finishPix(cropPix(pix, Math.round(num("x", 0, 0, 10000)), Math.round(num("y", 0, 0, 10000)), Math.round(num("w", 400, 1, 10000)), Math.round(num("h", 400, 1, 10000))), file, "cropped.png");
  }
  if (slug === "image-rotate") {
    const { pix, file } = await firstPix();
    const turns = F("mode", "90") === "180" ? 2 : F("mode", "90") === "270" ? 3 : 1;
    return finishPix(rotateFlip(pix, turns, "none"), file, "rotated.png");
  }
  if (slug === "image-flip") {
    const { pix, file } = await firstPix();
    return finishPix(rotateFlip(pix, 0, F("mode", "h") === "v" ? "v" : "h"), file, "flipped.png");
  }
  if (slug === "image-format-converter") {
    const { pix, file } = await firstPix();
    const format = ["jpeg", "png", "webp"].includes(F("mode", "jpeg")) ? F("mode", "jpeg") : "jpeg";
    const quality = num("quality", 90, 1, 100) / 100;
    const tryType = (format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg") as "image/png" | "image/jpeg" | "image/webp";
    let dataUrl = pixToDataUrl(pix, tryType === "image/webp" ? "image/png" : (tryType as "image/png" | "image/jpeg"), quality);
    let type: string = tryType === "image/webp" ? "image/png" : tryType;
    let name = `converted.${type === "image/png" ? "png" : format}`;
    if (format === "webp" && typeof document !== "undefined") {
      // Probe real WebP support; fall back to PNG openly when absent.
      const probe = pixToDataUrl({ width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) }, "image/webp", quality);
      if (probe.startsWith("data:image/webp")) {
        dataUrl = pixToDataUrl(pix, "image/webp", quality);
        type = "image/webp";
        name = "converted.webp";
      }
    }
    return { text: JSON.stringify({ file: file.name, width: pix.width, height: pix.height, output: name }, null, 2), image: dataUrl, artifacts: [{ name, mime: type, dataUrl }] };
  }
  if (slug === "image-compressor") {
    const { pix, file } = await firstPix();
    const quality = num("quality", 80, 1, 100) / 100;
    const maxDim = Math.round(num("maxdim", 1600, 0, 4000));
    let small = pix;
    if (maxDim > 0 && Math.max(pix.width, pix.height) > maxDim) {
      const scale = maxDim / Math.max(pix.width, pix.height);
      small = resizePix(pix, Math.max(1, Math.round(pix.width * scale)), Math.max(1, Math.round(pix.height * scale)));
    }
    const dataUrl = pixToDataUrl(small, "image/jpeg", quality);
    const bytes = Math.round(((dataUrl.length - "data:image/jpeg;base64,".length) * 3) / 4);
    return {
      text: JSON.stringify({ file: file.name, before: file.size, after: bytes, saved: file.size - bytes, width: small.width, height: small.height }, null, 2),
      image: dataUrl,
      artifacts: [{ name: "compressed.jpg", mime: "image/jpeg", dataUrl }],
    };
  }
  if (slug === "brightness-contrast") {
    const { pix, file } = await firstPix();
    const brightness = num("brightness", 10, -100, 100);
    const contrast = num("contrast", 10, -100, 100);
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    return finishPix(mapPixels(pix, (r, g, b, a) => [factor * (r + brightness * 2.55 - 128) + 128, factor * (g + brightness * 2.55 - 128) + 128, factor * (b + brightness * 2.55 - 128) + 128, a]), file, "adjusted.png");
  }
  if (slug === "saturation-vibrance") {
    const { pix, file } = await firstPix();
    const saturation = num("saturation", 20, -100, 100) / 100;
    const vibrance = num("vibrance", 20, 0, 100) / 100;
    return finishPix(
      mapPixels(pix, (r, g, b, a) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        const boost = vibrance * (1 - s);
        const [nr, ng, nb] = hslToRgb(h, Math.min(1, Math.max(0, s * (1 + saturation) + boost)), l);
        return [nr, ng, nb, a];
      }),
      file,
      "saturated.png",
    );
  }
  if (slug === "exposure-gamma") {
    const { pix, file } = await firstPix();
    const exposure = num("exposure", 0.5, -3, 3);
    const gamma = num("gamma", 1, 0.1, 3);
    const gain = Math.pow(2, exposure);
    return finishPix(mapPixels(pix, (r, g, b, a) => [255 * Math.pow((r / 255) * gain, 1 / gamma), 255 * Math.pow((g / 255) * gain, 1 / gamma), 255 * Math.pow((b / 255) * gain, 1 / gamma), a]), file, "exposed.png");
  }
  if (slug === "hue-hsl-adjust") {
    const { pix, file } = await firstPix();
    const hue = num("hue", 30, -180, 180);
    const sat = num("sat", 0, -100, 100) / 100;
    const light = num("light", 0, -100, 100) / 100;
    return finishPix(
      mapPixels(pix, (r, g, b, a) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        const [nr, ng, nb] = hslToRgb(h + hue, Math.min(1, Math.max(0, s + sat)), Math.min(1, Math.max(0, l + light)));
        return [nr, ng, nb, a];
      }),
      file,
      "adjusted.png",
    );
  }
  if (slug === "rgb-channels") {
    const { pix, file } = await firstPix();
    const extract = F("mode", "none");
    return finishPix(
      mapPixels(pix, (r, g, b, a) => {
        const scaled: [number, number, number] = [r * num("r", 1, 0, 2), g * num("g", 1, 0, 2), b * num("b", 1, 0, 2)];
        if (extract === "r" || extract === "g" || extract === "b") {
          const index = extract === "r" ? 0 : extract === "g" ? 1 : 2;
          return [scaled[index], scaled[index], scaled[index], a];
        }
        return [scaled[0], scaled[1], scaled[2], a];
      }),
      file,
      "channels.png",
    );
  }
  if (slug === "grayscale-sepia-invert") {
    const { pix, file } = await firstPix();
    const mode = F("mode", "gray");
    if (mode === "invert") return finishPix(mapPixels(pix, (r, g, b, a) => [255 - r, 255 - g, 255 - b, a]), file, "inverted.png");
    if (mode === "sepia") {
      return finishPix(
        mapPixels(pix, (r, g, b, a) => {
          const v = 0.299 * r + 0.587 * g + 0.114 * b;
          return [Math.min(255, v * 1.07), Math.min(255, v * 0.84), Math.min(255, v * 0.55), a];
        }),
        file,
        "sepia.png",
      );
    }
    return finishPix(
      mapPixels(pix, (r, g, b, a) => {
        const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        return [v, v, v, a];
      }),
      file,
      "grayscale.png",
    );
  }
  if (slug === "colorize-duotone") {
    const { pix, file } = await firstPix();
    const [dr, dg, db] = hexToRgb(parseHexField(F("dark", "#0a1025"), "#0a1025"));
    const [lr, lg, lb] = hexToRgb(parseHexField(F("light", "#f7f6f1"), "#f7f6f1"));
    return finishPix(
      mapPixels(pix, (r, g, b, a) => {
        const v = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return [dr + (lr - dr) * v, dg + (lg - dg) * v, db + (lb - db) * v, a];
      }),
      file,
      "duotone.png",
    );
  }
  if (slug === "blur-sharpen") {
    const { pix, file } = await firstPix();
    const amount = Math.round(num("amount", 3, 1, 10));
    if (F("mode", "blur") === "sharpen") {
      const blurred = blurPix(pix, 1);
      const out = new Uint8ClampedArray(pix.data.length);
      for (let i = 0; i < pix.data.length; i += 4) {
        for (let c = 0; c < 3; c += 1) out[i + c] = clampByte(pix.data[i + c] + (pix.data[i + c] - blurred.data[i + c]) * amount * 0.5);
        out[i + 3] = pix.data[i + 3];
      }
      return finishPix({ width: pix.width, height: pix.height, data: out }, file, "sharpened.png");
    }
    return finishPix(blurPix(pix, amount), file, "blurred.png");
  }
  if (slug === "noise-pixelate") {
    const { pix, file } = await firstPix();
    const amount = Math.round(num("amount", 8, 1, 64));
    if (F("mode", "pixelate") === "noise") {
      const grain = crypto.getRandomValues(new Int16Array(pix.width * pix.height));
      let seed = 0;
      return finishPix(
        mapPixels(pix, (r, g, b, a, _x, _y) => {
          const noise = grain[seed++ % grain.length] * (amount / 32768);
          return [r + noise, g + noise, b + noise, a];
        }),
        file,
        "grain.png",
      );
    }
    const small = resizePix(pix, Math.max(1, Math.floor(pix.width / amount)), Math.max(1, Math.floor(pix.height / amount)));
    return finishPix(resizePix(small, pix.width, pix.height), file, "pixelated.png");
  }
  if (slug === "posterize-solarize-threshold") {
    const { pix, file } = await firstPix();
    const mode = F("mode", "posterize");
    const levels = Math.round(num("levels", 4, 2, 16));
    if (mode === "solarize") {
      return finishPix(mapPixels(pix, (r, g, b, a) => [r > 127 ? 255 - r : r, g > 127 ? 255 - g : g, b > 127 ? 255 - b : b, a]), file, "solarized.png");
    }
    if (mode === "threshold") {
      const cutoff = Math.round((levels / 16) * 255);
      return finishPix(
        mapPixels(pix, (r, g, b, a) => {
          const v = 0.299 * r + 0.587 * g + 0.114 * b > cutoff ? 255 : 0;
          return [v, v, v, a];
        }),
        file,
        "threshold.png",
      );
    }
    return finishPix(
      mapPixels(pix, (r, g, b, a) => {
        const step = 255 / (levels - 1);
        return [Math.round(Math.round((r / 255) * (levels - 1)) * step), Math.round(Math.round((g / 255) * (levels - 1)) * step), Math.round(Math.round((b / 255) * (levels - 1)) * step), a];
      }),
      file,
      "posterized.png",
    );
  }
  if (slug === "vignette-glow") {
    const { pix, file } = await firstPix();
    const strength = num("strength", 50, 0, 100) / 100;
    const cx = pix.width / 2;
    const cy = pix.height / 2;
    const maxDist = Math.hypot(cx, cy);
    if (F("mode", "vignette") === "glow") {
      const soft = blurPix(pix, 6);
      return finishPix(
        mapPixels(pix, (r, g, b, a, x, y) => {
          const i = (y * pix.width + x) * 4;
          const amount = strength * 0.7;
          return [r + (soft.data[i] - r) * amount + 20 * strength, g + (soft.data[i + 1] - g) * amount + 20 * strength, b + (soft.data[i + 2] - b) * amount + 20 * strength, a];
        }),
        file,
        "glow.png",
      );
    }
    return finishPix(
      mapPixels(pix, (r, g, b, a, x, y) => {
        const factor = 1 - strength * 0.85 * Math.pow(Math.hypot(x - cx, y - cy) / maxDist, 1.8);
        return [r * factor, g * factor, b * factor, a];
      }),
      file,
      "vignette.png",
    );
  }
  if (slug === "emboss-clip-effect") {
    const { pix, file } = await firstPix();
    if (F("mode", "emboss") === "clip") {
      return finishPix(
        mapPixels(pix, (r, g, b, a) => {
          const v = 0.299 * r + 0.587 * g + 0.114 * b;
          const out = v < 85 ? 0 : v < 170 ? 128 : 255;
          return [out, out, out, a];
        }),
        file,
        "clip.png",
      );
    }
    const grey = mapPixels(pix, (r, g, b, a) => {
      const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      return [v, v, v, a];
    });
    const embossed = convolve(grey, [-2, -1, 0, -1, 1, 1, 0, 1, 2]);
    return finishPix(mapPixels(embossed, (r, g, b, a) => [r + 128, g + 128, b + 128, a]), file, "embossed.png");
  }
  if (slug === "equalize") {
    const { pix, file } = await firstPix();
    return finishPix(equalizePix(pix), file, "equalized.png");
  }
  if (slug === "edge-detection") {
    const { pix, file } = await firstPix();
    return finishPix(edgePix(pix), file, "edges.png");
  }
  if (slug === "tilt-shift") {
    const { pix, file } = await firstPix();
    const focus = num("focus", 50, 0, 100) / 100;
    const soft = blurPix(pix, Math.round(num("blur", 4, 1, 12)));
    const band = pix.height * 0.18;
    const center = pix.height * focus;
    return finishPix(
      mapPixels(pix, (r, g, b, a, x, y) => {
        const i = (y * pix.width + x) * 4;
        const distance = Math.min(1, Math.max(0, (Math.abs(y - center) - band) / (pix.height * 0.3)));
        return [r + (soft.data[i] - r) * distance, g + (soft.data[i + 1] - g) * distance, b + (soft.data[i + 2] - b) * distance, a];
      }),
      file,
      "tilt-shift.png",
    );
  }
  if (slug === "vintage-instant-lomo") {
    const { pix, file } = await firstPix();
    const preset = F("mode", "vintage");
    return finishPix(
      mapPixels(pix, (r, g, b, a, x, y) => {
        let [nr, ng, nb] = [r, g, b];
        if (preset === "vintage") {
          const v = 0.299 * r + 0.587 * g + 0.114 * b;
          nr = Math.min(255, v * 1.05 + 18);
          ng = Math.min(255, v * 0.9 + 10);
          nb = Math.min(255, v * 0.7);
        } else if (preset === "instant") {
          nr = Math.min(255, r * 1.06 + 12);
          ng = Math.min(255, g * 1.04 + 12);
          nb = Math.min(255, b * 1.02 + 14);
        } else {
          const [h, s, l] = rgbToHsl(r, g, b);
          [nr, ng, nb] = hslToRgb(h + 8, Math.min(1, s * 1.35), l * 0.96);
        }
        const cx = pix.width / 2;
        const cy = pix.height / 2;
        const factor = 1 - 0.35 * Math.pow(Math.hypot(x - cx, y - cy) / Math.hypot(cx, cy), 1.6);
        return [nr * factor, ng * factor, nb * factor, a];
      }),
      file,
      `${preset}.png`,
    );
  }
  if (slug === "blend-colors-into-image") {
    const { pix, file } = await firstPix();
    const [cr, cg, cb] = hexToRgb(parseHexField(F("color", "#3264ff"), "#3264ff"));
    const opacity = num("opacity", 30, 0, 100) / 100;
    const mode = F("mode", "multiply");
    const blend = (base: number, layer: number): number => {
      const l = layer / 255;
      const v = base / 255;
      if (mode === "screen") return 255 * (1 - (1 - v) * (1 - l));
      if (mode === "overlay") return 255 * (v < 0.5 ? 2 * v * l : 1 - 2 * (1 - v) * (1 - l));
      return base * l;
    };
    return finishPix(mapPixels(pix, (r, g, b, a) => [r + (blend(r, cr) - r) * opacity, g + (blend(g, cg) - g) * opacity, b + (blend(b, cb) - b) * opacity, a]), file, "blended.png");
  }
  if (slug === "merge-images") {
    const files = (extra?.files ?? []).slice(0, 8);
    if (files.length < 2) throw new ToolError("tool.error.generic");
    const pictures: Pix[] = [];
    for (const item of files) {
      try {
        pictures.push(await loadPix(item));
      } catch {
        throw new ToolError("tool.error.generic");
      }
    }
    const side = F("mode", "side") === "stack";
    const width = side ? Math.max(...pictures.map((p) => p.width)) : pictures.reduce((n, p) => n + p.width, 0);
    const height = side ? pictures.reduce((n, p) => n + p.height, 0) : Math.max(...pictures.map((p) => p.height));
    let canvas = blankPix(width, height, 0, 0, 0, 0);
    let ox = 0;
    let oy = 0;
    for (const picture of pictures) {
      canvas = overlayPix(canvas, picture, ox, oy, 1);
      if (side) oy += picture.height;
      else ox += picture.width;
    }
    return finishPix(canvas, files[0], "merged.png");
  }
  if (slug === "overlay-images") {
    const files = (extra?.files ?? []).slice(0, 2);
    if (files.length < 2) throw new ToolError("tool.error.generic");
    let base: Pix;
    let top: Pix;
    try {
      base = await loadPix(files[0]);
      top = await loadPix(files[1]);
    } catch {
      throw new ToolError("tool.error.generic");
    }
    const opacity = num("opacity", 80, 0, 100) / 100;
    return finishPix(overlayPix(base, top, Math.round(num("x", 20, -5000, 5000)), Math.round(num("y", 20, -5000, 5000)), opacity), files[0], "overlay.png");
  }
  if (slug === "split-image") {
    const { pix } = await firstPix();
    const rows = Math.round(num("rows", 2, 1, 8));
    const cols = Math.round(num("cols", 2, 1, 8));
    const tileW = Math.floor(pix.width / cols);
    const tileH = Math.floor(pix.height / rows);
    const artifacts: Array<{ name: string; mime: string; dataUrl: string }> = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const tile = cropPix(pix, c * tileW, r * tileH, c === cols - 1 ? pix.width - c * tileW : tileW, r === rows - 1 ? pix.height - r * tileH : tileH);
        const dataUrl = pixToDataUrl(tile);
        artifacts.push({ name: `tile-r${r + 1}c${c + 1}.png`, mime: "image/png", dataUrl });
      }
    }
    return {
      text: JSON.stringify({ tiles: artifacts.length, rows, cols }, null, 2),
      image: artifacts[0].dataUrl,
      artifacts,
    };
  }
  if (slug === "round-corners") {
    const { pix, file } = await firstPix();
    const radius = (num("radius", 15, 1, 50) / 100) * Math.min(pix.width, pix.height);
    const rounded = new Uint8ClampedArray(pix.data);
    for (let y = 0; y < pix.height; y += 1) {
      for (let x = 0; x < pix.width; x += 1) {
        const dx = Math.min(x, pix.width - 1 - x);
        const dy = Math.min(y, pix.height - 1 - y);
        const inside = dx >= radius || dy >= radius || Math.hypot(radius - dx, radius - dy) <= radius;
        if (!inside) rounded[(y * pix.width + x) * 4 + 3] = 0;
      }
    }
    return finishPix({ width: pix.width, height: pix.height, data: rounded }, file, "rounded.png");
  }
  if (slug === "add-border-frame") {
    const { pix, file } = await firstPix();
    const thickness = Math.max(1, Math.round((num("thickness", 5, 1, 25) / 100) * Math.min(pix.width, pix.height)));
    const [br, bg, bb] = hexToRgb(parseHexField(F("color", "#0a1025"), "#0a1025"));
    const out = new Uint8ClampedArray(pix.data);
    for (let y = 0; y < pix.height; y += 1) {
      for (let x = 0; x < pix.width; x += 1) {
        if (x < thickness || y < thickness || x >= pix.width - thickness || y >= pix.height - thickness) {
          const i = (y * pix.width + x) * 4;
          out[i] = br;
          out[i + 1] = bg;
          out[i + 2] = bb;
          out[i + 3] = 255;
        }
      }
    }
    return finishPix({ width: pix.width, height: pix.height, data: out }, file, "framed.png");
  }
  if (slug === "text-watermark-image" || slug === "meme-generator") {
    const { pix, file } = await firstPix();
    if (typeof document === "undefined") throw new ToolError("tool.error.generic");
    const canvas = document.createElement("canvas");
    canvas.width = pix.width;
    canvas.height = pix.height;
    const context = canvas.getContext("2d");
    if (!context) throw new ToolError("tool.error.generic");
    context.putImageData(new ImageData(new Uint8ClampedArray(pix.data), pix.width, pix.height), 0, 0);
    const opacity = num("opacity", slug === "meme-generator" ? 100 : 60, 5, 100) / 100;
    context.fillStyle = `rgba(255,255,255,${opacity})`;
    context.strokeStyle = `rgba(0,0,0,${opacity})`;
    context.textAlign = "center";
    const drawLine = (line: string, y: number, size: number) => {
      context.font = `700 ${size}px "Space Grotesk", sans-serif`;
      context.lineWidth = Math.max(1, size / 12);
      context.strokeText(line, pix.width / 2, y);
      context.fillText(line, pix.width / 2, y);
    };
    if (slug === "meme-generator") {
      const size = Math.max(12, Math.round(pix.width / 12));
      drawLine(F("top", "WHEN THE BUILD").toUpperCase().slice(0, 60), size * 1.2, size);
      drawLine(F("bottom", "PASSES FIRST TRY").toUpperCase().slice(0, 60), pix.height - size * 0.5, size);
    } else {
      const size = Math.max(10, Math.round((pix.width * num("size", 6, 2, 30)) / 100));
      const text = F("text", "© ToolsHub").slice(0, 120);
      const mode = F("mode", "bottom-right");
      const x = mode.includes("left") ? 12 : mode === "center" ? pix.width / 2 : pix.width - 12;
      const y = mode.startsWith("top") ? size * 1.2 : mode === "center" ? pix.height / 2 : pix.height - 12;
      const savedAlign = context.textAlign;
      context.textAlign = mode.includes("left") ? "left" : mode === "center" ? "center" : "right";
      context.font = `600 ${size}px "Space Grotesk", sans-serif`;
      context.lineWidth = Math.max(1, size / 14);
      context.strokeText(text, x, y);
      context.fillText(text, x, y);
      context.textAlign = savedAlign;
    }
    const dataUrl = canvas.toDataURL("image/png");
    const name = slug === "meme-generator" ? "meme.png" : "watermarked.png";
    return { text: JSON.stringify({ file: file.name, output: name }, null, 2), image: dataUrl, artifacts: [{ name, mime: "image/png", dataUrl }] };
  }
  if (slug === "image-color-picker" || slug === "palette-extractor") {
    const { pix, file } = await firstPix();
    const count = Math.round(num("colors", slug === "palette-extractor" ? 8 : 5, 1, 12));
    const { average, palette } = analyzeColors(pix, count);
    const rects = palette.map((hex, i) => `<rect x="${i * 64}" y="0" width="64" height="64" fill="${hex}"/>`).join("");
    const image = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${palette.length * 64}" height="64">${rects}</svg>`)}`;
    return {
      text: JSON.stringify({ file: file.name, average, palette }, null, 2),
      table: { head: ["Swatch", "Hex"], rows: palette.map((hex, i) => [`${i + 1}`, hex]) },
      image,
    };
  }
  if (slug === "image-gradient-generator") {
    if (typeof document === "undefined") throw new ToolError("tool.error.generic");
    const width = Math.round(num("w", 800, 16, 2000));
    const height = Math.round(num("h", 600, 16, 2000));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ToolError("tool.error.generic");
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, parseHexField(F("a", "#3264ff"), "#3264ff"));
    gradient.addColorStop(1, parseHexField(F("b", "#22d3ee"), "#22d3ee"));
    void num("angle", 135, 0, 360);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/png");
    return { text: JSON.stringify({ width, height }, null, 2), image: dataUrl, artifacts: [{ name: "gradient.png", mime: "image/png", dataUrl }] };
  }
  if (slug === "random-bitmap-generator") {
    const width = Math.round(num("w", 64, 8, 512));
    const height = Math.round(num("h", 64, 8, 512));
    const cell = Math.round(num("cells", 8, 1, 64));
    const colors = Math.round(num("colors", 4, 2, 8));
    const palette = ["#3264ff", "#22d3ee", "#ff6b4a", "#ffd166", "#06d6a0", "#ef476f", "#f7f6f1", "#0a1025"].slice(0, colors);
    const pix = blankPix(width, height);
    const picks = crypto.getRandomValues(new Uint8Array(Math.ceil(width / cell) * Math.ceil(height / cell)));
    let seed = 0;
    for (let gy = 0; gy < height; gy += cell) {
      for (let gx = 0; gx < width; gx += cell) {
        const [r, g, b] = hexToRgb(palette[picks[seed++ % picks.length]]);
        for (let y = gy; y < Math.min(gy + cell, height); y += 1) {
          for (let x = gx; x < Math.min(gx + cell, width); x += 1) {
            const i = (y * width + x) * 4;
            pix.data[i] = r;
            pix.data[i + 1] = g;
            pix.data[i + 2] = b;
            pix.data[i + 3] = 255;
          }
        }
      }
    }
    const dataUrl = pixToDataUrl(pix);
    return { text: JSON.stringify({ width, height, cells: cell }, null, 2), image: dataUrl, artifacts: [{ name: "bitmap.png", mime: "image/png", dataUrl }] };
  }
  if (slug === "svg-png-converter") {
    if (typeof document === "undefined" || typeof Image === "undefined") throw new ToolError("tool.error.generic");
    const source = F("text", input);
    if (!source.includes("<svg")) throw new ToolError("tool.error.generic");
    const scale = Math.round(num("scale", 2, 1, 8));
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("raster"));
      element.src = url;
    }).catch(() => {
      throw new ToolError("tool.error.generic");
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, (image.width || 300) * scale);
    canvas.height = Math.max(1, (image.height || 150) * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new ToolError("tool.error.generic");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    return { text: JSON.stringify({ width: canvas.width, height: canvas.height }, null, 2), image: dataUrl, artifacts: [{ name: "raster.png", mime: "image/png", dataUrl }] };
  }
  if (slug === "blurred-background-frame") {
    const { pix, file } = await firstPix();
    if (typeof document === "undefined") throw new ToolError("tool.error.generic");
    const size = 640;
    const scale = size / Math.max(pix.width, pix.height);
    const small = resizePix(pix, Math.max(1, Math.round(pix.width * scale)), Math.max(1, Math.round(pix.height * scale)));
    const background = blurPix(small, Math.round(num("blur", 8, 1, 20)));
    const square: Pix = { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
    const coverScale = Math.max(size / background.width, size / background.height);
    const cover = resizePix(background, Math.round(background.width * coverScale), Math.round(background.height * coverScale));
    const composed = overlayPix(square, cover, Math.round((size - cover.width) / 2), Math.round((size - cover.height) / 2), 1);
    const darkened = mapPixels(composed, (r, g, b, a) => [r * 0.75, g * 0.75, b * 0.75, a]);
    const fitScale = Math.min((size * 0.86) / small.width, (size * 0.86) / small.height);
    const fit = resizePix(small, Math.round(small.width * fitScale), Math.round(small.height * fitScale));
    const framed = overlayPix(darkened, fit, Math.round((size - fit.width) / 2), Math.round((size - fit.height) / 2), 1);
    const dataUrl = pixToDataUrl(framed);
    return { text: JSON.stringify({ file: file.name, size }, null, 2), image: dataUrl, artifacts: [{ name: "framed.png", mime: "image/png", dataUrl }] };
  }
  if (slug === "image-censor") {
    const { pix, file } = await firstPix();
    const x = Math.round((num("x", 30, 0, 100) / 100) * pix.width);
    const y = Math.round((num("y", 30, 0, 100) / 100) * pix.height);
    const w = Math.round((num("w", 40, 1, 100) / 100) * pix.width);
    const h = Math.round((num("h", 40, 1, 100) / 100) * pix.height);
    const blocks = Math.round(num("blocks", 12, 2, 60));
    const region = cropPix(pix, x, y, w, h);
    const tiny = resizePix(region, Math.max(1, Math.min(blocks, region.width)), Math.max(1, Math.round((blocks * region.height) / Math.max(1, region.width))));
    const censored = resizePix(tiny, region.width, region.height);
    const out = new Uint8ClampedArray(pix.data);
    for (let row = 0; row < region.height; row += 1) {
      for (let col = 0; col < region.width; col += 1) {
        for (let c = 0; c < 4; c += 1) out[((y + row) * pix.width + x + col) * 4 + c] = censored.data[(row * region.width + col) * 4 + c];
      }
    }
    return finishPix({ width: pix.width, height: pix.height, data: out }, file, "censored.png");
  }
  if (slug === "gif-toolkit") {
    const file = extra?.files?.[0];
    if (!file) throw new ToolError("tool.error.generic");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = parseGif(bytes);
    if (!info) throw new ToolError("tool.error.generic");
    if (typeof document === "undefined" || typeof Image === "undefined") {
      return { text: JSON.stringify({ file: file.name, ...info, note: "First-frame preview needs a browser." }, null, 2) };
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("decode"));
        element.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) throw new ToolError("tool.error.generic");
      context.drawImage(image, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      return {
        text: JSON.stringify({ file: file.name, ...info }, null, 2),
        image: dataUrl,
        artifacts: [{ name: `${file.name.replace(/\.gif$/i, "")}-frame1.png`, mime: "image/png", dataUrl }],
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (slug === "video-thumbnail-extractor") {
    if (typeof document === "undefined") throw new ToolError("tool.error.generic");
    const file = extra?.files?.[0];
    if (!file) throw new ToolError("tool.error.generic");
    const url = URL.createObjectURL(file);
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("load"));
      });
      video.currentTime = Math.min(Math.max(num("time", 1, 0, 3600), 0), Math.max(0, video.duration - 0.1));
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context || canvas.width === 0) throw new ToolError("tool.error.generic");
      context.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      return {
        text: JSON.stringify({ file: file.name, at: video.currentTime, size: `${canvas.width}×${canvas.height}` }, null, 2),
        image: dataUrl,
        artifacts: [{ name: `${file.name}-thumb.jpg`, mime: "image/jpeg", dataUrl }],
      };
    } catch {
      throw new ToolError("tool.error.generic");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (slug === "background-remover") {
    const { pix, file } = await firstPix();
    const [kr, kg, kb] = hexToRgb(parseHexField(F("color", "#00ff00"), "#00ff00"));
    const threshold = num("threshold", 60, 1, 200);
    // Honest chroma-key: solid backdrops vanish cleanly; busy photos will not.
    // AI segmentation would need a model download this app refuses to hide.
    const out = new Uint8ClampedArray(pix.data);
    for (let i = 0; i < pix.data.length; i += 4) {
      const distance = Math.hypot(pix.data[i] - kr, pix.data[i + 1] - kg, pix.data[i + 2] - kb);
      if (distance < threshold) out[i + 3] = 0;
    }
    return finishPix({ width: pix.width, height: pix.height, data: out }, file, "cutout.png");
  }
  if (slug === "batch-image-processing") {
    const files = (extra?.files ?? []).slice(0, 20);
    if (files.length === 0) throw new ToolError("tool.error.generic");
    const { default: JSZip } = await import("jszip");
    const mode = F("mode", "grayscale");
    const zip = new JSZip();
    const rows: string[][] = [];
    for (const item of files.slice(0, 20)) {
      let pix: Pix;
      try {
        pix = await loadPix(item);
      } catch {
        continue;
      }
      let done = pix;
      if (mode === "grayscale") {
        done = mapPixels(pix, (r, g, b, a) => {
          const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          return [v, v, v, a];
        });
      } else if (mode === "half") {
        done = resizePix(pix, Math.max(1, Math.floor(pix.width / 2)), Math.max(1, Math.floor(pix.height / 2)));
      } else {
        const scale = 256 / Math.max(pix.width, pix.height);
        done = resizePix(pix, Math.max(1, Math.round(pix.width * scale)), Math.max(1, Math.round(pix.height * scale)));
      }
      const dataUrl = pixToDataUrl(done);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const name = item.name.replace(/\.[^.]+$/, "") + "-batch.png";
      zip.file(name, base64, { base64: true });
      rows.push([item.name, name]);
    }
    if (rows.length === 0) throw new ToolError("tool.error.generic");
    const blob = await zip.generateAsync({ type: "uint8array" });
    let binary = "";
    for (let i = 0; i < blob.length; i += 1) binary += String.fromCharCode(blob[i]);
    return {
      text: JSON.stringify({ processed: rows.length }, null, 2),
      table: { head: ["Source", "Output"], rows },
      artifacts: [{ name: "batch.zip", mime: "application/zip", dataUrl: `data:application/zip;base64,${btoa(binary)}` }],
    };
  }
  if (slug === "screenshot-capture") {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia || typeof document === "undefined") {
      throw new ToolError("tool.error.generic");
    }
    // The browser owns the picker (screen / window / tab) and the permission
    // prompt; this only snapshots the granted stream, once, then stops it.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      throw new ToolError("tool.error.generic");
    }
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context || canvas.width === 0) throw new ToolError("tool.error.generic");
      context.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      return { text: JSON.stringify({ width: canvas.width, height: canvas.height }, null, 2), image: dataUrl, artifacts: [{ name: "screenshot.png", mime: "image/png", dataUrl }] };
    } finally {
      for (const track of stream.getTracks()) track.stop();
    }
  }
  if (slug === "image-base64") {
    const file = extra?.files?.[0];
    if (!file) throw new ToolError("tool.error.generic");
    if (file.size > 10 * 1024 * 1024) throw new ToolError("tool.error.fileTooLarge");
    const buffer = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i]);
    const encoded = `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
    return {
      text: encoded,
      image: file.type.startsWith("image/") ? encoded : undefined,
      artifacts: [{ name: `${file.name}.b64.txt`, mime: "text/plain", dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(encoded)}` }],
    };
  }
  if (slug === "favicon-multi-size") {
    const { pix, file } = await firstPix();
    if (typeof document === "undefined") throw new ToolError("tool.error.generic");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new ToolError("tool.error.generic");
    const source = document.createElement("canvas");
    source.width = pix.width;
    source.height = pix.height;
    const sourceContext = source.getContext("2d");
    if (!sourceContext) throw new ToolError("tool.error.generic");
    sourceContext.putImageData(new ImageData(new Uint8ClampedArray(pix.data), pix.width, pix.height), 0, 0);
    const artifacts: Array<{ name: string; mime: string; dataUrl: string }> = [];
    for (const size of [16, 32, 48, 180]) {
      canvas.width = size;
      canvas.height = size;
      context.clearRect(0, 0, size, size);
      context.drawImage(source, 0, 0, size, size);
      const dataUrl = canvas.toDataURL("image/png");
      artifacts.push({ name: `favicon-${size}.png`, mime: "image/png", dataUrl });
    }
    return {
      text: JSON.stringify({ file: file.name, sizes: [16, 32, 48, 180] }, null, 2),
      image: artifacts[3].dataUrl,
      artifacts,
    };
  }
  return null;
};

/** GIF89a header facts: dimensions plus an image-descriptor count. Pure. */
export function parseGif(bytes: Uint8Array): { width: number; height: number; frames: number } | null {
  const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
  if (header !== "GIF87a" && header !== "GIF89a" || bytes.length < 13) return null;
  const width = bytes[6] + bytes[7] * 256;
  const height = bytes[8] + bytes[9] * 256;
  let frames = 0;
  let i = 13;
  if ((bytes[10] & 0x80) !== 0) i += 3 * Math.pow(2, (bytes[10] & 7) + 1);
  while (i < bytes.length) {
    const block = bytes[i];
    if (block === 0x3b) break;
    if (block === 0x2c) {
      frames += 1;
      // Separator + 9-byte descriptor; a local color table may follow it.
      const packed = bytes[i + 9] ?? 0;
      i += 10;
      if ((packed & 0x80) !== 0) i += 3 * Math.pow(2, (packed & 7) + 1);
      // LZW minimum code byte, then data sub-blocks to their terminator.
      i += 1;
      while (i < bytes.length && bytes[i] !== 0) i += bytes[i] + 1;
      i += 1;
      continue;
    }
    if (block === 0x21) {
      // Extension: label + sub-blocks.
      i += 2;
      while (i < bytes.length && bytes[i] !== 0) i += bytes[i] + 1;
      i += 1;
      continue;
    }
    break;
  }
  return { width, height, frames };
}
