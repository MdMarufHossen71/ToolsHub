/**
 * Small colour helpers used to derive theme tokens that were previously wrong.
 *
 * Two concrete bugs motivated this file:
 *  - `--muted-foreground` was set to the full-strength text colour, which flattened
 *    every piece of secondary copy (card blurbs, empty states, footer, helper text)
 *    into primary text and destroyed the type hierarchy the CSS depends on.
 *  - `--primary-foreground` was hardcoded to white for light themes too, so a
 *    light accent produced white-on-light text.
 */

type Rgb = { r: number; g: number; b: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function parseHex(input: string): Rgb | null {
  const hex = input.trim().replace("#", "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    // Length-checked by the regex above: `slice` (unlike indexing) always
    // returns a string, so no fallback is needed.
    const a = hex.slice(0, 1);
    const b = hex.slice(1, 2);
    const c = hex.slice(2, 3);
    return {
      r: Number.parseInt(a + a, 16),
      g: Number.parseInt(b + b, 16),
      b: Number.parseInt(c + c, 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

const toHex = ({ r, g, b }: Rgb) => `#${[r, g, b].map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`;

/** WCAG relative luminance. */
export function luminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 0;
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG contrast ratio between two hex colours, 1–21. */
export function contrastRatio(a: string, b: string) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Linear blend: `amount` 0 returns `from`, 1 returns `to`. */
export function mix(from: string, to: string, amount: number) {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return from;
  const ratio = clamp(amount, 0, 1);
  return toHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
  });
}

/**
 * Text colour that reads on `background`. Picks whichever of the two candidates
 * has the higher contrast ratio rather than assuming white.
 */
export function readableOn(background: string, light = "#ffffff", dark = "#0a1025") {
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

/**
 * De-emphasised text: pulled toward the surface but held at a contrast ratio of
 * at least 4.5:1 against it, so secondary copy stays legible in every preset.
 */
export function mutedText(text: string, surface: string) {
  let candidate = mix(text, surface, 0.4);
  for (let step = 0; step < 8 && contrastRatio(candidate, surface) < 4.5; step += 1) {
    candidate = mix(candidate, text, 0.25);
  }
  return candidate;
}

/**
 * An accent colour safe to use as small text.
 *
 * The brand cobalt `#3264ff` reaches only 4.41:1 on the `#f7f6f1` paper background,
 * so eyebrows, inline links and helper labels would sit just below AA. Rather than
 * changing the documented brand hex — which still fills buttons, rules and focus
 * rings — this returns a version pushed away from the surface until it clears the
 * ratio. It runs for every preset, including user-defined ones, so a pale custom
 * accent cannot produce unreadable link text.
 */
export function readableAccent(accent: string, surface: string, minimum = 4.5) {
  if (contrastRatio(accent, surface) >= minimum) return accent;
  // Darker on a light surface, lighter on a dark one.
  const pole = luminance(surface) > 0.18 ? "#000000" : "#ffffff";
  let candidate = accent;
  for (let step = 0; step < 14 && contrastRatio(candidate, surface) < minimum; step += 1) {
    candidate = mix(candidate, pole, 0.07);
  }
  return candidate;
}
