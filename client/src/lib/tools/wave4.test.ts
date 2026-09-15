import { describe, expect, it } from "vitest";
import {
  analyzeColors,
  blankPix,
  blurPix,
  convolve,
  cropPix,
  edgePix,
  equalizePix,
  mapPixels,
  overlayPix,
  parseGif,
  resizePix,
  rotateFlip,
  runImageTools,
} from "./imageTools";

const solid = (w: number, h: number, r: number, g: number, b: number) => {
  const pix = blankPix(w, h);
  for (let i = 0; i < w * h; i += 1) {
    pix.data[i * 4] = r;
    pix.data[i * 4 + 1] = g;
    pix.data[i * 4 + 2] = b;
    pix.data[i * 4 + 3] = 255;
  }
  return pix;
};

describe("pixel primitives", () => {
  it("maps, resizes, crops, rotates and flips dimensions", () => {
    const red = solid(4, 2, 255, 0, 0);
    const inverted = mapPixels(red, (r, g, b, a) => [255 - r, 255 - g, 255 - b, a]);
    expect([inverted.data[0], inverted.data[1], inverted.data[2]]).toEqual([0, 255, 255]);
    expect(resizePix(red, 8, 4)).toMatchObject({ width: 8, height: 4 });
    expect(cropPix(red, 1, 0, 2, 2)).toMatchObject({ width: 2, height: 2 });
    expect(rotateFlip(red, 1, "none")).toMatchObject({ width: 2, height: 4 });
    expect(rotateFlip(red, 0, "h")).toMatchObject({ width: 4, height: 2 });
  });

  it("blurs, convolves identity, equalizes and edges", () => {
    const red = solid(4, 4, 200, 0, 0);
    expect(blurPix(red, 0)).toBe(red);
    expect(blurPix(red, 2)).toMatchObject({ width: 4, height: 4 });
    const same = convolve(red, [0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(same.data[0]).toBe(200);
    expect(equalizePix(red)).toMatchObject({ width: 4, height: 4 });
    expect(edgePix(red)).toMatchObject({ width: 4, height: 4 });
  });

  it("overlays with opacity and analyzes colors", () => {
    const base = solid(4, 4, 0, 0, 0);
    const top = solid(2, 2, 255, 255, 255);
    const out = overlayPix(base, top, 1, 1, 1);
    expect([out.data[(1 * 4 + 1) * 4], out.data[0]]).toEqual([255, 0]);
    const { average, palette } = analyzeColors(solid(4, 4, 255, 0, 0), 3);
    expect(average).toBe("#ff0000");
    expect(palette.length).toBeGreaterThan(0);
  });
});

describe("gif header facts", () => {
  it("reads dimensions and counts frames", () => {
    // Minimal 2×1, 2-frame GIF89a assembled by hand.
    const bytes = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 2, 0, 1, 0, 0x80, 0, 0,
      0, 0, 0, 255, 255, 255,
      0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x2c, 0, 0, 0, 0, 2, 0, 1, 0, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00,
      0x2c, 0, 0, 0, 0, 2, 0, 1, 0, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00,
      0x3b,
    ]);
    expect(parseGif(bytes)).toEqual({ width: 2, height: 1, frames: 2 });
    expect(parseGif(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("browser-only image tools fail gracefully in node", () => {
  it("needs files and a canvas", async () => {
    await expect(runImageTools("image-resize", "", "default", ((k: string) => k) as never, undefined)).rejects.toThrow();
    const t = ((key: string) => key) as Parameters<typeof runImageTools>[3];
    const file = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    await expect(runImageTools("image-resize", "", "default", t, { fields: { width: "10", height: "10" }, files: [file] })).rejects.toThrow();
  });

  it("random-bitmap builds every pixel before touching canvas", async () => {
    // Regression: the palette was indexed by the raw random byte (0–255) into a
    // 2–8 entry table, so this threw a TypeError on the first cell. Reaching the
    // canvas step (`no-canvas` here) proves pixel generation completed.
    const t = ((key: string) => key) as Parameters<typeof runImageTools>[3];
    await expect(
      runImageTools("random-bitmap-generator", "", "default", t, { fields: { w: "16", h: "16", cells: "4", colors: "4" }, files: [] }),
    ).rejects.toThrow("no-canvas");
  });
});
