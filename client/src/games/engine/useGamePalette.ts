/**
 * Resolved theme colours for canvas drawing.
 *
 * A canvas cannot use `var(--primary)`, so a game that hardcodes hexes would ignore
 * the theme entirely — twelve presets plus custom themes exist, and a bright board
 * on a Gruvbox background looks broken. `AppSettingsContext` writes every token onto
 * the root element as a concrete colour, so reading the computed values back gives a
 * palette that follows whatever the player picked.
 */
import { useEffect, useMemo, useState } from "react";
import { useSettings } from "@/contexts/AppSettingsContext";

export type GamePalette = {
  background: string;
  surface: string;
  surfaceRaised: string;
  sunken: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  primary: string;
  onPrimary: string;
  accent: string;
  danger: string;
  ink: string;
  onInk: string;
};

const TOKENS: Record<keyof GamePalette, string> = {
  background: "--background",
  surface: "--card",
  surfaceRaised: "--surface-raised",
  sunken: "--surface-sunken",
  border: "--border",
  borderStrong: "--border-strong",
  text: "--foreground",
  muted: "--muted-foreground",
  primary: "--primary",
  onPrimary: "--primary-foreground",
  accent: "--accent-strong",
  danger: "--danger",
  ink: "--ink",
  onInk: "--on-ink",
};

/** Used before the first paint, and on a server render where there is no document. */
const FALLBACK: GamePalette = {
  background: "#f7f6f1",
  surface: "#fffefb",
  surfaceRaised: "#f8f7f5",
  sunken: "#f2f1ed",
  border: "#dcd8cc",
  borderStrong: "#848486",
  text: "#0a1025",
  muted: "#5b5f6b",
  primary: "#3264ff",
  onPrimary: "#ffffff",
  accent: "#ff6b4a",
  danger: "#ef4444",
  ink: "#0a1025",
  onInk: "#f4f7ff",
};

function readPalette(): GamePalette {
  if (typeof document === "undefined") return FALLBACK;
  const styles = getComputedStyle(document.documentElement);
  const entries = Object.entries(TOKENS).map(([name, token]) => {
    const value = styles.getPropertyValue(token).trim();
    return [name, value || FALLBACK[name as keyof GamePalette]];
  });
  return Object.fromEntries(entries) as GamePalette;
}

export function useGamePalette(): GamePalette {
  const { appearance, theme } = useSettings();
  const [palette, setPalette] = useState<GamePalette>(FALLBACK);

  // Read after the effect that writes the tokens has run, which is why this is an
  // effect rather than a `useState` initialiser.
  useEffect(() => {
    setPalette(readPalette());
  }, [appearance, theme]);

  return useMemo(() => palette, [palette]);
}

/** `color` at `alpha` opacity, for canvas fills that need a wash rather than a solid. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return color;
  // The group always participates on a match; `?? ""` is type-level only.
  const value = parseInt(match[1] ?? "", 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}
