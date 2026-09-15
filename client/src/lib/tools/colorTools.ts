/** Color lab wave: colord for transforms, lib/color for contrast and mixes. */
import { ToolError, field, type ToolRunner } from "@/lib/toolOperations";
import { contrastRatio, mix } from "@/lib/color";

const CSS_NAMES: Array<[string, string]> = [
  ["aliceblue", "#f0f8ff"], ["antiquewhite", "#faebd7"], ["aqua", "#00ffff"], ["aquamarine", "#7fffd4"],
  ["azure", "#f0ffff"], ["beige", "#f5f5dc"], ["bisque", "#ffe4c4"], ["black", "#000000"],
  ["blanchedalmond", "#ffebcd"], ["blue", "#0000ff"], ["blueviolet", "#8a2be2"], ["brown", "#a52a2a"],
  ["burlywood", "#deb887"], ["cadetblue", "#5f9ea0"], ["chartreuse", "#7fff00"], ["chocolate", "#d2691e"],
  ["coral", "#ff7f50"], ["cornflowerblue", "#6495ed"], ["cornsilk", "#fff8dc"], ["crimson", "#dc143c"],
  ["cyan", "#00ffff"], ["darkblue", "#00008b"], ["darkcyan", "#008b8b"], ["darkgoldenrod", "#b8860b"],
  ["darkgray", "#a9a9a9"], ["darkgreen", "#006400"], ["darkkhaki", "#bdb76b"], ["darkmagenta", "#8b008b"],
  ["darkolivegreen", "#556b2f"], ["darkorange", "#ff8c00"], ["darkorchid", "#9932cc"], ["darkred", "#8b0000"],
  ["darksalmon", "#e9967a"], ["darkseagreen", "#8fbc8f"], ["darkslateblue", "#483d8b"], ["darkslategray", "#2f4f4f"],
  ["darkturquoise", "#00ced1"], ["darkviolet", "#9400d3"], ["deeppink", "#ff1493"], ["deepskyblue", "#00bfff"],
  ["dimgray", "#696969"], ["dodgerblue", "#1e90ff"], ["firebrick", "#b22222"], ["floralwhite", "#fffaf0"],
  ["forestgreen", "#228b22"], ["fuchsia", "#ff00ff"], ["gainsboro", "#dcdcdc"], ["ghostwhite", "#f8f8ff"],
  ["gold", "#ffd700"], ["goldenrod", "#daa520"], ["gray", "#808080"], ["green", "#008000"],
  ["greenyellow", "#adff2f"], ["honeydew", "#f0fff0"], ["hotpink", "#ff69b4"], ["indianred", "#cd5c5c"],
  ["indigo", "#4b0082"], ["ivory", "#fffff0"], ["khaki", "#f0e68c"], ["lavender", "#e6e6fa"],
  ["lavenderblush", "#fff0f5"], ["lawngreen", "#7cfc00"], ["lemonchiffon", "#fffacd"], ["lightblue", "#add8e6"],
  ["lightcoral", "#f08080"], ["lightcyan", "#e0ffff"], ["lightgoldenrodyellow", "#fafad2"], ["lightgray", "#d3d3d3"],
  ["lightgreen", "#90ee90"], ["lightpink", "#ffb6c1"], ["lightsalmon", "#ffa07a"], ["lightseagreen", "#20b2aa"],
  ["lightskyblue", "#87cefa"], ["lightslategray", "#778899"], ["lightsteelblue", "#b0c4de"], ["lightyellow", "#ffffe0"],
  ["lime", "#00ff00"], ["limegreen", "#32cd32"], ["linen", "#faf0e6"], ["magenta", "#ff00ff"],
  ["maroon", "#800000"], ["mediumaquamarine", "#66cdaa"], ["mediumblue", "#0000cd"], ["mediumorchid", "#ba55d3"],
  ["mediumpurple", "#9370db"], ["mediumseagreen", "#3cb371"], ["mediumslateblue", "#7b68ee"], ["mediumspringgreen", "#00fa9a"],
  ["mediumturquoise", "#48d1cc"], ["mediumvioletred", "#c71585"], ["midnightblue", "#191970"], ["mintcream", "#f5fffa"],
  ["mistyrose", "#ffe4e1"], ["moccasin", "#ffe4b5"], ["navajowhite", "#ffdead"], ["navy", "#000080"],
  ["oldlace", "#fdf5e6"], ["olive", "#808000"], ["olivedrab", "#6b8e23"], ["orange", "#ffa500"],
  ["orangered", "#ff4500"], ["orchid", "#da70d6"], ["palegoldenrod", "#eee8aa"], ["palegreen", "#98fb98"],
  ["paleturquoise", "#afeeee"], ["palevioletred", "#db7093"], ["papayawhip", "#ffefd5"], ["peachpuff", "#ffdab9"],
  ["peru", "#cd853f"], ["pink", "#ffc0cb"], ["plum", "#dda0dd"], ["powderblue", "#b0e0e6"],
  ["purple", "#800080"], ["rebeccapurple", "#663399"], ["red", "#ff0000"], ["rosybrown", "#bc8f8f"],
  ["royalblue", "#4169e1"], ["saddlebrown", "#8b4513"], ["salmon", "#fa8072"], ["sandybrown", "#f4a460"],
  ["seagreen", "#2e8b57"], ["seashell", "#fff5ee"], ["sienna", "#a0522d"], ["silver", "#c0c0c0"],
  ["skyblue", "#87ceeb"], ["slateblue", "#6a5acd"], ["slategray", "#708090"], ["snow", "#fffafa"],
  ["springgreen", "#00ff7f"], ["steelblue", "#4682b4"], ["tan", "#d2b48c"], ["teal", "#008080"],
  ["thistle", "#d8bfd8"], ["tomato", "#ff6347"], ["turquoise", "#40e0d0"], ["violet", "#ee82ee"],
  ["wheat", "#f5deb3"], ["white", "#ffffff"], ["whitesmoke", "#f5f5f5"], ["yellow", "#ffff00"],
  ["yellowgreen", "#9acd32"],
];

function validHex(value: string): string {
  const hex = value.trim();
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new ToolError("tool.error.hex");
  return hex;
}

export const runColorTools: ToolRunner = async (slug, _input, _option, _t, extra) => {
  const F = (key: string, fallback = "") => field(extra, key, fallback);
  const { colord } = await import("colord");

  const swatch = (hex: string) => ({ hex, rgb: colord(hex).toRgbString(), hsl: colord(hex).toHslString() });

  if (slug === "css-named-colors") {
    const query = F("query").toLowerCase();
    const rows = CSS_NAMES.filter(([name, hex]) => query === "" || name.includes(query) || hex.includes(query)).slice(0, 60);
    return { text: rows.map(([name, hex]) => `${name}: ${hex}`).join("\n"), table: { head: ["Name", "Hex"], rows } };
  }
  if (slug === "lighten-darken-color") {
    const color = validHex(F("color", "#3264ff"));
    const amount = Math.min(Math.max(Number(F("amount", "20")) || 0, -100), 100) / 100;
    const out = amount >= 0 ? colord(color).lighten(amount).toHex() : colord(color).darken(-amount).toHex();
    return { text: JSON.stringify({ ...swatch(out) }, null, 2), image: swatchImage([color, out]) };
  }
  if (slug === "saturation-shift") {
    const color = validHex(F("color", "#3264ff"));
    const amount = Math.min(Math.max(Number(F("amount", "30")) || 0, -100), 100) / 100;
    const out = amount >= 0 ? colord(color).saturate(amount).toHex() : colord(color).desaturate(-amount).toHex();
    return { text: JSON.stringify({ ...swatch(out) }, null, 2), image: swatchImage([color, out]) };
  }
  if (slug === "greyscale-color") {
    const color = validHex(F("color", "#3264ff"));
    const out = colord(color).grayscale().toHex();
    return { text: JSON.stringify({ ...swatch(out) }, null, 2), image: swatchImage([color, out]) };
  }
  if (slug === "invert-color") {
    const color = validHex(F("color", "#3264ff"));
    const out = colord(color).invert().toHex();
    return { text: JSON.stringify({ ...swatch(out) }, null, 2), image: swatchImage([color, out]) };
  }
  if (slug === "hue-shift-color") {
    const color = validHex(F("color", "#3264ff"));
    const out = colord(color).rotate(Number(F("degrees", "90")) || 0).toHex();
    return { text: JSON.stringify({ ...swatch(out) }, null, 2), image: swatchImage([color, out]) };
  }
  if (slug === "random-color-generator") {
    const count = Math.min(Math.max(parseInt(F("count", "5"), 10) || 5, 1), 30);
    const bytes = crypto.getRandomValues(new Uint8Array(count * 3));
    const colors: string[] = [];
    for (let i = 0; i < count; i += 1) {
      // Three bytes per color by loop construction; `?? 0` is type-level only.
      colors.push(`#${(bytes[i * 3] ?? 0).toString(16).padStart(2, "0")}${(bytes[i * 3 + 1] ?? 0).toString(16).padStart(2, "0")}${(bytes[i * 3 + 2] ?? 0).toString(16).padStart(2, "0")}`);
    }
    return { text: colors.join("\n"), image: swatchImage(colors) };
  }
  if (slug === "color-scheme-generator") {
    const base = validHex(F("color", "#3264ff"));
    const mode = F("mode", "analogous");
    const shifts = mode === "triadic" ? [0, 120, 240] : mode === "split" ? [0, 150, 210] : mode === "tetradic" ? [0, 90, 180, 270] : [0, -30, 30];
    const colors = shifts.map((degrees) => colord(base).rotate(degrees).toHex());
    return { text: colors.join("\n"), image: swatchImage(colors) };
  }
  if (slug === "color-blender") {
    const a = validHex(F("a", "#3264ff"));
    const b = validHex(F("b", "#ff6b4a"));
    const amount = Math.min(Math.max(Number(F("amount", "50")) || 0, 0), 100) / 100;
    const out = mix(a, b, amount);
    return { text: JSON.stringify({ ...swatch(out) }, null, 2), image: swatchImage([a, out, b]) };
  }
  if (slug === "gradient-generator") {
    const a = validHex(F("a", "#3264ff"));
    const b = validHex(F("b", "#22d3ee"));
    const angle = Number(F("angle", "135")) || 0;
    return { text: `background: linear-gradient(${angle}deg, ${a}, ${b});`, image: gradientImage(a, b, angle) };
  }
  if (slug === "gradient-palette") {
    const a = validHex(F("a", "#3264ff"));
    const b = validHex(F("b", "#22d3ee"));
    const steps = Math.min(Math.max(parseInt(F("steps", "5"), 10) || 5, 2), 20);
    const colors: string[] = [];
    for (let i = 0; i < steps; i += 1) colors.push(mix(a, b, steps === 1 ? 0 : i / (steps - 1)));
    return { text: colors.join("\n"), image: swatchImage(colors) };
  }
  if (slug === "contrast-checker") {
    const a = validHex(F("a", "#0a1025"));
    const b = validHex(F("b", "#f7f6f1"));
    const ratio = contrastRatio(a, b);
    return {
      text: JSON.stringify({ ratio: Number(ratio.toFixed(2)), aaNormal: ratio >= 4.5, aaLarge: ratio >= 3, aaaNormal: ratio >= 7 }, null, 2),
    };
  }
  if (slug === "color-blindness-simulator") {
    const base = validHex(F("color", "#22aa55"));
    const { r, g, b } = colord(base).toRgb();
    // Machado 2009 matrices, protanopia / deuteranopia / tritanopia.
    const simulate = (matrix: number[][]) => {
      const [nr = 0, ng = 0, nb = 0] = matrix.map((row) => Math.min(255, Math.max(0, Math.round((row[0] ?? 0) * r + (row[1] ?? 0) * g + (row[2] ?? 0) * b))));
      return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
    };
    const rows: Array<[string, string]> = [
      ["Original", base],
      ["Protanopia (red-blind)", simulate([[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]])],
      ["Deuteranopia (green-blind)", simulate([[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]])],
      ["Tritanopia (blue-blind)", simulate([[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]])],
    ];
    return { text: rows.map(([name, hex]) => `${name}: ${hex}`).join("\n"), table: { head: ["Vision", "Hex"], rows }, image: swatchImage(rows.map(([, hex]) => hex)) };
  }
  if (slug === "shades-tints-generator") {
    const base = validHex(F("color", "#3264ff"));
    const steps = Math.min(Math.max(parseInt(F("steps", "4"), 10) || 4, 1), 10);
    const { colord: make } = await import("colord");
    const colors: string[] = [];
    for (let i = steps; i >= 1; i -= 1) colors.push(make(base).darken((i / (steps + 1)) * 0.7).toHex());
    colors.push(base);
    for (let i = 1; i <= steps; i += 1) colors.push(make(base).lighten((i / (steps + 1)) * 0.7).toHex());
    return { text: colors.join("\n"), image: swatchImage(colors) };
  }
  return null;
};

/** Side-by-side swatch strip rendered as an SVG data URL. */
function swatchImage(colors: string[]): string {
  const width = Math.max(1, colors.length) * 64;
  const rects = colors.map((color, i) => `<rect x="${i * 64}" y="0" width="64" height="64" fill="${color}"/>`).join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="64">${rects}</svg>`)}`;
}

function gradientImage(a: string, b: string, angle: number): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><defs><linearGradient id="g" gradientTransform="rotate(${90 - angle} 0.5 0.5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="320" height="120" fill="url(#g)"/></svg>`,
  )}`;
}
