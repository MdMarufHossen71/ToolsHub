/** Cobalt Workshop design reminder: theme editing feels like tuning an instrument panel—clear token labels, immediate feedback, and no hidden state. */
import { useMemo, useState } from "react";
import { Check, Clipboard, Download, Edit3, Palette, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultPreset, type ThemePreset, type ThemeTokens } from "@/data/themes";
import { useSettings } from "@/contexts/AppSettingsContext";
import { type TranslationKey } from "@/i18n/translations";
import { luminance, readableOn } from "@/lib/color";

const labels: { key: keyof ThemeTokens; label: TranslationKey }[] = [{ key: "background", label: "appearance.tokenBackground" }, { key: "surface", label: "appearance.tokenSurface" }, { key: "text", label: "appearance.tokenText" }, { key: "primary", label: "appearance.tokenPrimary" }, { key: "secondary", label: "appearance.tokenSecondary" }, { key: "border", label: "appearance.tokenBorder" }];
const fresh = (): ThemeTokens => ({ background: "#151b29", surface: "#202a3b", text: "#edf3ff", primary: "#5b8cff", secondary: "#22d3ee", border: "#3b4d67" });

export function ThemePanel() {
  const { appearance, allThemes, setAppearance, saveCustomTheme, deleteCustomTheme, resetThemes, t } = useSettings();
  const [tokens, setTokens] = useState<ThemeTokens>(fresh()); const [name, setName] = useState(""); const [importValue, setImportValue] = useState(""); const [notice, setNotice] = useState(""); const active = allThemes.find((theme) => theme.id === appearance) ?? defaultPreset;
  const exportTheme = async () => { try { await navigator.clipboard.writeText(JSON.stringify({ name: active.name, tokens: active.tokens }, null, 2)); setNotice(t("appearance.copied")); } catch { setNotice(t("tool.copyFailed")); } };
  const parseImport = () => { try { if (importValue.length > 20000) throw new Error(); const parsed = JSON.parse(importValue); const next = parsed.tokens ?? parsed; if (!next || !labels.every(({ key }) => /^#[0-9a-f]{6}$/i.test(next[key]))) throw new Error(); setTokens(next); setName(typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 60) : t("appearance.importedName")); setNotice(t("appearance.imported")); } catch { setNotice(t("appearance.invalid")); } };
  // `isDark` drives the `dark` class, the light/dark toggle and every derived token,
  // so it is measured from the background the user actually picked rather than
  // assumed. It was hardcoded `true`, which broke the toggle for light custom themes.
  const save = () => { if (!name.trim()) { setNotice(t("appearance.nameRequired")); return; } saveCustomTheme({ id: `custom-${Date.now()}`, name: name.trim(), isDark: luminance(tokens.background) < 0.35, tokens, custom: true }); setName(""); setNotice(t("appearance.saved")); };
  const edit = (theme: ThemePreset) => { setName(theme.name); setTokens(theme.tokens); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); };
  const setToken = (key: keyof ThemeTokens, value: string) => { if (/^#[0-9a-f]{0,6}$/i.test(value)) setTokens((current) => ({ ...current, [key]: value })); };
  const previewStyle = useMemo(() => ({ "--preview-bg": tokens.background, "--preview-surface": tokens.surface, "--preview-text": tokens.text, "--preview-primary": tokens.primary, "--preview-secondary": tokens.secondary, "--preview-border": tokens.border, "--preview-on-primary": readableOn(tokens.primary) } as React.CSSProperties), [tokens]);

  return <section className="settings-section" aria-labelledby="appearance-title">
    <div className="settings-section-heading"><div><p className="eyebrow">{t("appearance.eyebrow")}</p><h2 id="appearance-title">{t("appearance.title")}</h2><p>{t("appearance.copy")}</p></div><Palette className="settings-heading-icon" aria-hidden="true" /></div>
    {/* "system" was missing from this list, so a user who had followed their OS theme
        could see no option matching their own current setting. */}
    <label className="appearance-select"><span>{t("appearance.mode")}</span><select value={appearance} onChange={(event) => setAppearance(event.target.value)}><option value="system">{t("appearance.system")}</option>{allThemes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>
    <div className="theme-preset-grid">{allThemes.map((theme) => <article key={theme.id} className={`theme-preset-card ${appearance === theme.id ? "selected" : ""}`} style={{ "--preview-bg": theme.tokens.background, "--preview-surface": theme.tokens.surface, "--preview-text": theme.tokens.text, "--preview-primary": theme.tokens.primary, "--preview-secondary": theme.tokens.secondary, "--preview-border": theme.tokens.border } as React.CSSProperties}>
      <div className="preset-screen" aria-hidden="true"><span /><strong>TOOLS<span>&</span>GAMES</strong><i /></div>
      <div className="preset-meta"><div><h3>{theme.name}</h3>
        {/* Keyed by token name, not colour: two tokens holding the same hex produced
            duplicate React keys and the row silently lost a swatch. */}
        <div className="theme-swatches" role="img" aria-label={t("a11y.themeSwatches")}>{Object.entries(theme.tokens).map(([token, color]) => <i key={token} style={{ backgroundColor: color }} />)}</div></div>
        <div className="flex gap-1"><Button size="sm" variant={appearance === theme.id ? "default" : "outline"} onClick={() => setAppearance(theme.id)} aria-pressed={appearance === theme.id}>{appearance === theme.id ? <Check className="mr-1 size-3.5" aria-hidden="true" /> : null}{t("appearance.use")}</Button>{theme.custom && <><Button size="icon" variant="ghost" onClick={() => edit(theme)} aria-label={`${t("appearance.edit")} — ${theme.name}`}><Edit3 className="size-3.5" aria-hidden="true" /></Button><Button size="icon" variant="ghost" onClick={() => deleteCustomTheme(theme.id)} aria-label={`${t("appearance.delete")} — ${theme.name}`}><Trash2 className="size-3.5 text-destructive" aria-hidden="true" /></Button></>}</div>
      </div>
    </article>)}</div>
    <div className="theme-builder">
      <div className="builder-heading"><div><p className="eyebrow">{t("appearance.customEyebrow")}</p><h3 id="appearance-custom-title">{t("appearance.create")}</h3></div><Button variant="ghost" size="sm" onClick={() => { setTokens(fresh()); setName(""); }}><RotateCcw className="mr-2 size-3.5" aria-hidden="true" />{t("appearance.reset")}</Button></div>
      <div className="builder-grid">
        <div className="token-controls"><label className="theme-name-input"><span>{t("appearance.name")}</span><Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("appearance.namePlaceholder")} /></label>{labels.map(({ key, label }) => <label className="token-control" key={key}><span>{t(label)}</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(tokens[key]) ? tokens[key] : "#000000"} onChange={(event) => setToken(key, event.target.value)} aria-label={t(label)} /><Input value={tokens[key]} onChange={(event) => setToken(key, event.target.value)} maxLength={7} aria-label={t(label)} /></label>)}</div>
        {/* Specimen copy, not a working control: the whole block is one image to a
            screen reader so its fake input and button are not offered as real ones. */}
        <div className="live-theme-preview" style={previewStyle} role="img" aria-label={t("appearance.previewRegion")}><p aria-hidden="true">{t("appearance.previewLabel")}</p><h4 aria-hidden="true">{t("appearance.previewHeading")}</h4><div className="preview-card" aria-hidden="true"><span>{t("appearance.previewCard")}</span><strong>{t("appearance.previewStrong")}</strong><input placeholder={t("appearance.previewInput")} tabIndex={-1} readOnly /><button type="button" tabIndex={-1}>{t("appearance.previewButton")}</button><a>{t("appearance.previewLink")} →</a></div></div>
      </div>
      <div className="builder-actions"><Button onClick={save}><Plus className="mr-2 size-4" aria-hidden="true" />{t("appearance.save")}</Button><Button variant="outline" onClick={exportTheme}><Download className="mr-2 size-4" aria-hidden="true" />{t("appearance.export")}</Button><Button variant="outline" onClick={() => navigator.clipboard.readText().then(setImportValue).catch(() => setNotice(t("common.error")))}><Clipboard className="mr-2 size-4" aria-hidden="true" />{t("appearance.paste")}</Button></div>
      <div className="theme-import"><Input value={importValue} onChange={(event) => setImportValue(event.target.value)} placeholder={t("appearance.importPlaceholder")} aria-label={t("appearance.importPlaceholder")} /><Button variant="outline" onClick={parseImport}><Upload className="mr-2 size-4" aria-hidden="true" />{t("appearance.import")}</Button></div>
      {/* Every outcome in this panel is reported only through `notice`, so the region
          is always present and announces on change rather than on mount. */}
      <p className="settings-notice" role="status" aria-live="polite">{notice}</p>
      <Button variant="ghost" size="sm" className="mt-3 text-muted-foreground" onClick={() => { resetThemes(); setNotice(t("appearance.defaulted")); }}><RotateCcw className="mr-2 size-3.5" aria-hidden="true" />{t("appearance.resetDefault")}</Button>
    </div>
  </section>;
}
