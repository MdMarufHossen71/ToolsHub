/** Cobalt Workshop design reminder: direct, tactile settings controls with Electric Cobalt as the visible active state. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { interpolate, translations, type Locale, type TranslationKey } from "@/i18n/translations";
import { defaultPreset, fallbackTokens, isThemeTokens, themePresets, type ThemePreset } from "@/data/themes";
import { migrateLegacyKeys, safeGet, safeSet, settingsKey } from "@/lib/storage";
import { mix, mutedText, readableAccent, readableOn, contrastRatio } from "@/lib/color";

type Appearance = "system" | string;

type AppSettings = {
  language: Locale;
  setLanguage: (language: Locale) => void;
  theme: "light" | "dark";
  appearance: Appearance;
  allThemes: ThemePreset[];
  setAppearance: (appearance: Appearance) => void;
  toggleTheme: () => void;
  saveCustomTheme: (theme: ThemePreset) => void;
  deleteCustomTheme: (id: string) => void;
  resetThemes: () => void;
  /** Re-reads persisted settings into React state; used after a data import. */
  refreshFromStorage: () => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

const SettingsContext = createContext<AppSettings | null>(null);

const LANGUAGE_KEY = settingsKey("language");
const APPEARANCE_KEY = settingsKey("appearance");
const CUSTOM_THEMES_KEY = settingsKey("customThemes");

/** Runs the hyphen-prefix to `tgb:` namespace migration exactly once per page load. */
let migrated = false;
function ensureMigrated() {
  if (migrated) return;
  migrated = true;
  migrateLegacyKeys();
}

function readLanguage(): Locale {
  ensureMigrated();
  const saved = safeGet<unknown>(LANGUAGE_KEY, null);
  return saved === "bn" || saved === "en" ? saved : "en";
}

function readAppearance(): Appearance {
  ensureMigrated();
  const saved = safeGet<unknown>(APPEARANCE_KEY, null);
  return typeof saved === "string" && saved.length > 0 && saved.length < 64 ? saved : "system";
}

function readCustomThemes(): ThemePreset[] {
  ensureMigrated();
  const saved = safeGet<unknown>(CUSTOM_THEMES_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.filter((theme): theme is ThemePreset => {
    if (!theme || typeof theme !== "object") return false;
    const candidate = theme as Partial<ThemePreset>;
    return candidate.custom === true && typeof candidate.id === "string" && typeof candidate.name === "string" && typeof candidate.isDark === "boolean" && isThemeTokens(candidate.tokens);
  });
}

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Locale>(readLanguage);
  const [customThemes, setCustomThemes] = useState<ThemePreset[]>(readCustomThemes);
  const [appearance, setAppearanceState] = useState<Appearance>(readAppearance);
  const [systemDark, setSystemDark] = useState(() => {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });

  const allThemes = useMemo(() => [...themePresets, ...customThemes], [customThemes]);
  const activeTheme = useMemo(
    () => (appearance === "system" ? (systemDark ? (themePresets.find((theme) => theme.id === "dark") ?? defaultPreset) : defaultPreset) : (allThemes.find((theme) => theme.id === appearance) ?? defaultPreset)),
    [appearance, allThemes, systemDark],
  );
  const theme = activeTheme.isDark ? "dark" : "light";

  // Last dark preset the user actually had applied, so light/dark toggling is reversible.
  const [lastDarkId, setLastDarkId] = useState("dark");
  useEffect(() => {
    if (activeTheme.isDark && appearance !== "system") setLastDarkId(activeTheme.id);
  }, [activeTheme, appearance]);

  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const tokens = activeTheme?.tokens ?? fallbackTokens;
    root.classList.toggle("dark", activeTheme.isDark);
    root.dataset.theme = activeTheme.id;

    // Derived tokens. `muted-foreground` must stay weaker than `foreground` or every
    // piece of secondary copy in the app renders at full strength, and each "on"
    // colour is chosen by contrast rather than assumed to be white.
    const set = (name: string, value: string) => root.style.setProperty(name, value);
    set("--background", tokens.background);
    set("--foreground", tokens.text);
    set("--card", tokens.surface);
    set("--card-foreground", tokens.text);
    set("--popover", tokens.surface);
    set("--popover-foreground", tokens.text);
    set("--secondary", mix(tokens.surface, tokens.text, activeTheme.isDark ? 0.08 : 0.05));
    set("--secondary-foreground", tokens.text);
    set("--muted", mix(tokens.surface, tokens.text, activeTheme.isDark ? 0.1 : 0.06));
    set("--muted-foreground", mutedText(tokens.text, tokens.surface));
    set("--accent", mix(tokens.surface, tokens.primary, activeTheme.isDark ? 0.16 : 0.1));
    set("--accent-foreground", tokens.text);
    set("--accent-strong", tokens.secondary);
    set("--primary", tokens.primary);
    set("--primary-foreground", readableOn(tokens.primary));
    // Cobalt doubles as a text colour for eyebrows, inline links and helper labels.
    // Those need 4.5:1 against whichever of the two page fields is the harder case,
    // while `--primary` keeps the exact brand hex for fills, rules and focus rings.
    set("--primary-text", readableAccent(tokens.primary, contrastRatio(tokens.primary, tokens.surface) <= contrastRatio(tokens.primary, tokens.background) ? tokens.surface : tokens.background));
    set("--border", tokens.border);
    set("--input", tokens.border);
    set("--ring", tokens.primary);
    set("--surface", tokens.surface);
    set("--surface-raised", mix(tokens.surface, tokens.text, activeTheme.isDark ? 0.06 : 0.03));
    set("--surface-sunken", mix(tokens.background, tokens.text, activeTheme.isDark ? 0.04 : 0.02));
    set("--border-subtle", mix(tokens.border, tokens.surface, 0.45));
    // `--border-strong` marks interactive boundaries (inputs, secondary buttons,
    // option cards), so it is pulled far enough toward the text colour to clear the
    // 3:1 non-text contrast ratio WCAG 2.2 asks for. `--border` stays a hairline.
    set("--border-strong", mix(tokens.border, tokens.text, 0.42));

    // Theme-aware equivalents of the hex values the stylesheet used to hardcode.
    // The "ink" family is the dark panel used by the hero and the games feature:
    // in a light theme it is a deliberate contrast against the paper background,
    // and in a dark theme it deepens the existing background rather than fighting
    // it. Everything that sits on top of it is derived from that one surface, so
    // an ink panel never ends up with unreadable copy on it.
    const ink = activeTheme.isDark ? mix(tokens.background, "#000000", 0.25) : "#0a1025";
    const onInk = readableOn(ink, "#f4f7ff", tokens.text);
    set("--ink", ink);
    set("--ink-raised", mix(ink, tokens.text, 0.08));
    set("--ink-border", mix(ink, onInk, 0.24));
    set("--on-ink", onInk);
    set("--on-ink-muted", mutedText(onInk, ink));
    // Cobalt on an ink panel needs lifting: the brand hex is only 1.9:1 there.
    set("--on-ink-accent", readableAccent(tokens.primary, ink));

    safeSet(APPEARANCE_KEY, appearance);
  }, [appearance, activeTheme]);

  useEffect(() => {
    safeSet(CUSTOM_THEMES_KEY, customThemes);
  }, [customThemes]);

  useEffect(() => {
    document.documentElement.lang = language === "bn" ? "bn" : "en";
    // One decorative label lives in a stylesheet `content:` string, which cannot read
    // the translation dictionary. Passing it in as a custom property keeps the
    // dictionary the single source of truth for it. `JSON.stringify` produces a
    // correctly quoted and escaped CSS string for any value in either locale.
    const dictionary = translations[language] ?? translations.en;
    document.documentElement.style.setProperty("--label-instrument-tray", JSON.stringify(dictionary["tools.instrumentTray"] ?? ""));
  }, [language]);

  const refreshFromStorage = useCallback(() => {
    setLanguageState(readLanguage());
    setAppearanceState(readAppearance());
    setCustomThemes(readCustomThemes());
  }, []);

  const value = useMemo<AppSettings>(
    () => ({
      language,
      theme,
      appearance,
      allThemes,
      refreshFromStorage,
      setLanguage: (next) => {
        setLanguageState(next);
        safeSet(LANGUAGE_KEY, next);
      },
      setAppearance: setAppearanceState,
      // Remembers the dark preset you came from, so a Nord user who toggles to light
      // and back gets Nord again instead of the plain "dark" preset.
      toggleTheme: () => setAppearanceState(theme === "dark" ? "light" : lastDarkId),
      saveCustomTheme: (newTheme) => {
        setCustomThemes((current) => [...current.filter((entry) => entry.id !== newTheme.id && entry.name !== newTheme.name), { ...newTheme, custom: true }]);
        setAppearanceState(newTheme.id);
      },
      deleteCustomTheme: (id) => {
        setCustomThemes((current) => current.filter((entry) => entry.id !== id));
        if (appearance === id) setAppearanceState("system");
      },
      resetThemes: () => {
        setCustomThemes([]);
        setAppearanceState("system");
      },
      // A missing key must never throw: `t()` runs inside render, so a throw here
      // would blank the whole application through the error boundary.
      t: (key, values) => {
        const dictionary = translations[language] ?? translations.en;
        const template = dictionary[key] ?? translations.en[key];
        if (typeof template !== "string") {
          if (import.meta.env.DEV) console.warn(`[i18n] missing translation key: ${String(key)}`);
          return String(key);
        }
        return interpolate(template, values);
      },
    }),
    [language, theme, appearance, allThemes, refreshFromStorage, lastDarkId],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within AppSettingsProvider");
  return context;
}

export const useTranslation = useSettings;
