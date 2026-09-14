/**
 * Icon generator for ToolsHub.
 *
 * The brand mark is a cobalt plate with two 45°-rotated paper wedges. It is drawn as
 * an inline SVG in `client/src/components/Logo.tsx` for the app, but a favicon and the
 * install icons have to exist as real files before the app runs, so this rasterises
 * the same geometry without taking a dependency. There is no image library here on
 * purpose: a PNG is four chunks and a zlib stream, and Node already ships both.
 *
 * Outputs (all under `client/public/`, committed as static assets):
 *   icons/icon-192.png            transparent corners, the tab/PWA icon
 *   icons/icon-512.png            same art at install size
 *   icons/icon-maskable-512.png   art inset to the maskable safe zone on solid cobalt
 *   icons/apple-touch-icon.png    opaque, square, because iOS applies its own rounding
 *   icons/favicon-32.png          small raster fallback for the SVG favicon
 *
 * Every edge is anti-aliased by supersampling: a pixel is covered by 4×4 point
 * samples and the samples are averaged, so the diagonal wedge edges are not jagged.
 * After writing, each file is read back and decoded — IHDR dimensions and bit depth,
 * the CRC of every chunk, and the inflated IDAT length — so a malformed PNG cannot be
 * committed silently.
 *
 * Run with:  node scripts/make-icons.mjs   (or `pnpm run icons`)
 */
import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "client", "public", "icons");

// --- Mark geometry, in the same 29×29 space the SVG uses --------------------
const MARK = 29;
const RADIUS = 8;
const HALF_DIAGONAL = (15 * Math.SQRT2) / 2; // a 15px square rotated 45°
const LEFT = { cx: 2.5, cy: 14.5 };
const RIGHT = { cx: 25.5, cy: 14.5 };

// --- Palette, fixed to the light preset: a favicon cannot read CSS tokens ---
const PRIMARY = [0x32, 0x64, 0xff]; // Electric Cobalt
const PAPER_WARM = [0xff, 0xfe, 0xfb]; // --surface
const PAPER = [0xf7, 0xf6, 0xf1]; // --background

/**
 * `field` is the colour painted behind the art, or null for transparent corners.
 * `inset` scales the mark inside the tile; the maskable icon sits at 0.7 so the
 * wedge tips stay inside the 80%-diameter safe circle a launcher may crop to.
 */
const ICONS = [
  { file: "icon-192.png", size: 192, field: null, inset: 1 },
  { file: "icon-512.png", size: 512, field: null, inset: 1 },
  { file: "icon-maskable-512.png", size: 512, field: PRIMARY, inset: 0.7 },
  { file: "apple-touch-icon.png", size: 180, field: PRIMARY, inset: 1 },
  { file: "favicon-32.png", size: 32, field: null, inset: 1 },
];

/** True when (x, y) is inside the plate's rounded square. */
function insidePlate(x, y) {
  if (x < 0 || x > MARK || y < 0 || y > MARK) return false;
  const nx = Math.min(Math.max(x, RADIUS), MARK - RADIUS);
  const ny = Math.min(Math.max(y, RADIUS), MARK - RADIUS);
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy <= RADIUS * RADIUS + 1e-9;
}

/** True when (x, y) is inside a 45°-rotated square given its centre and half-diagonal. */
function insideWedge(x, y, wedge) {
  return Math.abs(x - wedge.cx) + Math.abs(y - wedge.cy) <= HALF_DIAGONAL;
}

/**
 * Colour of one sample point, given that point's pixel centre in mark space.
 * Layers are opaque, so the last fill that matches wins.
 */
function sample(markX, markY, icon) {
  let rgba = icon.field ? [icon.field[0], icon.field[1], icon.field[2], 255] : [0, 0, 0, 0];
  if (!insidePlate(markX, markY)) return rgba;
  rgba = [PRIMARY[0], PRIMARY[1], PRIMARY[2], 255];
  if (insideWedge(markX, markY, LEFT)) return [PAPER_WARM[0], PAPER_WARM[1], PAPER_WARM[2], 255];
  if (insideWedge(markX, markY, RIGHT)) return [PAPER[0], PAPER[1], PAPER[2], 255];
  return rgba;
}

/** Renders one icon to a tightly-packed RGBA buffer, 4 bytes per pixel. */
function render(icon) {
  const { size, inset } = icon;
  const samples = 4;
  const perSample = 1 / samples;
  const scale = (size * inset) / MARK; // output pixels per mark unit
  const origin = (size - size * inset) / 2;
  const rgba = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const markX = (px + (sx + 0.5) * perSample - origin) / scale;
          const markY = (py + (sy + 0.5) * perSample - origin) / scale;
          const [r, g, b, a] = sample(markX, markY, icon);
          red += r * a;
          green += g * a;
          blue += b * a;
          alpha += a;
        }
      }
      const index = (py * size + px) * 4;
      rgba[index] = alpha ? Math.round(red / alpha) : 0;
      rgba[index + 1] = alpha ? Math.round(green / alpha) : 0;
      rgba[index + 2] = alpha ? Math.round(blue / alpha) : 0;
      rgba[index + 3] = Math.round(alpha / (samples * samples));
    }
  }
  return rgba;
}

// --- Minimal PNG writer -----------------------------------------------------

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

function encodePng(size, rgba) {
  const scatter = 4;
  const stride = size * scatter;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Reads a PNG back and reports what the bytes actually say. Throws on corruption. */
function verify(file) {
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
  const raw = inflateSync(Buffer.concat(idat));
  const expectedRaw = height * (1 + width * 4);
  if (raw.length !== expectedRaw) throw new Error(`${file}: IDAT inflated to ${raw.length}B, expected ${expectedRaw}B`);
  for (let y = 0; y < height; y += 1) {
    if (raw[y * (1 + width * 4)] !== 0) throw new Error(`${file}: unexpected filter on row ${y}`);
  }
  return { width, height, bitDepth, colorType, idatBytes: Buffer.concat(idat).length, rawBytes: raw.length };
}

// --- Run --------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
let failed = false;

for (const icon of ICONS) {
  const file = path.join(OUT_DIR, icon.file);
  const bytes = encodePng(icon.size, render(icon));
  writeFileSync(file, bytes);
  try {
    const info = verify(file);
    const kind = info.colorType === 6 ? "RGBA" : `type ${info.colorType}`;
    const corners = icon.field ? "opaque" : "transparent";
    console.log(`  ${icon.file}  ${info.width}×${info.height}  ${info.bitDepth}-bit ${kind}  ${corners}  ${bytes.length}B  (IDAT ${info.idatBytes}B → ${info.rawBytes}B raw, CRC ok)`);
  } catch (error) {
    failed = true;
    console.error(`  ${icon.file}  FAILED: ${error.message}`);
  }
}

console.log(failed ? "\nOne or more icons failed verification." : `\nWrote and verified ${ICONS.length} icon(s) to client/public/icons/.`);
process.exitCode = failed ? 1 : 0;
