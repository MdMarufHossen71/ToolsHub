/**
 * Social-share (Open Graph) image generator for ToolsHub.
 *
 * Produces `client/public/og-image.png` at exactly 1200×630 — the size every social
 * crawler expects. A rasteriser cannot typeset, so the image carries no text: it is
 * the brand field plus the mark's geometry, drawn as pure shapes.
 *
 * There is no image dependency here on purpose; the PNG writer and the anti-aliased
 * sampler are the same small ones the icon generator uses. A pixel is covered by
 * 3×3 point samples and averaged, so the rotated wedge edges stay smooth. After
 * writing, the file is read back and decoded (IHDR dimensions, every chunk CRC, the
 * inflated IDAT length) so a malformed PNG cannot be committed silently.
 *
 * Run with:  node scripts/make-og.mjs   (or `pnpm run og`)
 */
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_FILE = path.join(ROOT, "client", "public", "og-image.png");

const WIDTH = 1200;
const HEIGHT = 630;

// --- Palette, fixed to the light preset: a share card cannot read CSS tokens ----
const COBALT = [0x32, 0x64, 0xff]; // Electric Cobalt, the brand field
const COBALT_LIGHT = [0x5c, 0x84, 0xff]; // decorative wedges on the field
const PAPER_WARM = [0xff, 0xfe, 0xfb]; // the mark plate

// --- Composition ---------------------------------------------------------------
const PLATE = 320; // central plate edge length
const PLATE_RADIUS = 90;
const PLATE_X = (WIDTH - PLATE) / 2;
const PLATE_Y = (HEIGHT - PLATE) / 2;
const MARK_SCALE = PLATE / 29; // the mark is drawn in a 29×29 space
const WEDGE_HALF = (15 * Math.SQRT2) / 2 * MARK_SCALE; // a 15px square rotated 45°

const DECOR_HALF = 300;
const DECOR = [
  { cx: 210, cy: HEIGHT / 2 },
  { cx: WIDTH - 210, cy: HEIGHT / 2 },
];

const LEFT = { cx: PLATE_X + 2.5 * MARK_SCALE, cy: PLATE_Y + 14.5 * MARK_SCALE };
const RIGHT = { cx: PLATE_X + 25.5 * MARK_SCALE, cy: PLATE_Y + 14.5 * MARK_SCALE };

function insideRoundedRect(x, y, rx, ry, w, h, radius) {
  if (x < rx || x > rx + w || y < ry || y > ry + h) return false;
  const nx = Math.min(Math.max(x, rx + radius), rx + w - radius);
  const ny = Math.min(Math.max(y, ry + radius), ry + h - radius);
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy <= radius * radius + 1e-9;
}

function insideWedge(x, y, wedge) {
  return Math.abs(x - wedge.cx) + Math.abs(y - wedge.cy) <= wedge.half;
}

/** Colour of one sample point. Opaque layers, so the last fill that matches wins. */
function sample(x, y) {
  let color = COBALT;

  for (const wedge of DECOR) {
    if (insideWedge(x, y, { ...wedge, half: DECOR_HALF })) {
      color = COBALT_LIGHT;
      break;
    }
  }

  if (insideRoundedRect(x, y, PLATE_X, PLATE_Y, PLATE, PLATE, PLATE_RADIUS)) {
    color = PAPER_WARM;
    if (insideWedge(x, y, { ...LEFT, half: WEDGE_HALF }) || insideWedge(x, y, { ...RIGHT, half: WEDGE_HALF })) {
      color = COBALT;
    }
  }

  return color;
}

/** Renders the card to a tightly-packed RGBA buffer, 4 bytes per pixel. */
function render() {
  const samples = 3;
  const perSample = 1 / samples;
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let py = 0; py < HEIGHT; py += 1) {
    for (let px = 0; px < WIDTH; px += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const [r, g, b] = sample(px + (sx + 0.5) * perSample, py + (sy + 0.5) * perSample);
          red += r;
          green += g;
          blue += b;
        }
      }
      const total = samples * samples;
      const index = (py * WIDTH + px) * 4;
      rgba[index] = Math.round(red / total);
      rgba[index + 1] = Math.round(green / total);
      rgba[index + 2] = Math.round(blue / total);
      rgba[index + 3] = 255;
    }
  }
  return rgba;
}

// --- Minimal PNG writer --------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Reads the PNG back and reports what the bytes actually say. Throws on corruption. */
function verify(file, expectedWidth, expectedHeight) {
  const bytes = readFileSync(file);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) throw new Error(`${file}: bad PNG signature`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expected = bytes.readUInt32BE(offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== expected) throw new Error(`${file}: bad CRC in ${type}`);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    }
    if (type === "IDAT") idat.push(data);
    if (type === "IEND") break;
    offset += 12 + length;
  }
  if (width !== expectedWidth || height !== expectedHeight) throw new Error(`${file}: is ${width}×${height}, expected ${expectedWidth}×${expectedHeight}`);
  const raw = inflateSync(Buffer.concat(idat));
  const expectedRaw = height * (1 + width * 4);
  if (raw.length !== expectedRaw) throw new Error(`${file}: IDAT inflated to ${raw.length}B, expected ${expectedRaw}B`);
  return { width, height, bitDepth, colorType, idatBytes: Buffer.concat(idat).length, bytes: bytes.length };
}

// --- Run -----------------------------------------------------------------------
const png = encodePng(WIDTH, HEIGHT, render());
writeFileSync(OUT_FILE, png);
const info = verify(OUT_FILE, WIDTH, HEIGHT);
const kind = info.colorType === 6 ? "RGBA" : `type ${info.colorType}`;
console.log(`Wrote and verified ${path.relative(ROOT, OUT_FILE).replace(/\\/g, "/")}  ${info.width}×${info.height}  ${info.bitDepth}-bit ${kind}  ${info.bytes}B  (IDAT ${info.idatBytes}B, CRC ok)`);
