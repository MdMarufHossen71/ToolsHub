/** Cobalt Workshop design reminder: AI setup is an accountable, transparent guide—not a funnel—built around user-controlled credentials. */
import { useState } from "react";
import { Link } from "wouter";
import { Check, ExternalLink, KeyRound, Mic, ShieldCheck, Trash2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { clearApiKey, getAiSettings, hasApiKey, setAiSettings, setApiKey } from "@/lib/ai/client";

const providers = [{ name: "OpenAI", url: "https://platform.openai.com/api-keys" }, { name: "Google AI Studio", url: "https://aistudio.google.com/app/apikey" }, { name: "Anthropic", url: "https://console.anthropic.com/settings/keys" }];

/**
 * The key lives in localStorage under a secret key that backups refuse to
 * export or import. The field clears on save so the key is never left sitting
 * in the DOM, and status is shown as present/hidden rather than echoed back.
 */
function KeySettings() {
  const { t } = useTranslation();
  const [keyInput, setKeyInput] = useState("");
  const [baseUrl, setBaseUrl] = useState(() => getAiSettings().baseUrl);
  const [model, setModel] = useState(() => getAiSettings().model);
  const [saved, setSaved] = useState(() => hasApiKey());
  const [notice, setNotice] = useState("");

  const save = () => {
    if (!setAiSettings({ baseUrl, model })) {
      setNotice(t("ai.badUrl"));
      return;
    }
    const result = setApiKey(keyInput);
    if (!result.ok) {
      setNotice(result.error === "empty" ? t("ai.keyMissing") : t("tool.error.generic"));
      return;
    }
    setKeyInput("");
    setSaved(true);
    setNotice(t("ai.keySaved"));
  };

  const remove = () => {
    clearApiKey();
    setSaved(false);
    setKeyInput("");
    setNotice(t("ai.keyRemoved"));
  };

  return (
    <article className="setup-card">
      <KeyRound className="setup-icon" aria-hidden="true" />
      <h2>{t("ai.keyTitle")}</h2>
      <p className="privacy-callout" style={{ marginTop: 0 }}>
        <ShieldCheck className="size-4" aria-hidden="true" />
        {t("ai.keyCopy")}
      </p>
      <p className="tool-note" role="status">
        {saved ? t("ai.keyPresent") : t("ai.keyMissing")}
      </p>
      <div className="tool-form" style={{ paddingInline: 0 }}>
        <label className="tool-field">
          <span>{t("ai.keyLabel")}</span>
          <Input
            type="password"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            placeholder={t("ai.keyPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            aria-label={t("ai.keyLabel")}
          />
        </label>
        <label className="tool-field">
          <span>{t("ai.baseLabel")}</span>
          <Input
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            inputMode="url"
            spellCheck={false}
            aria-label={t("ai.baseLabel")}
          />
        </label>
        <label className="tool-field">
          <span>{t("ai.modelLabel")}</span>
          <Input value={model} onChange={(event) => setModel(event.target.value)} spellCheck={false} aria-label={t("ai.modelLabel")} />
        </label>
      </div>
      <div className="bench-actions" style={{ paddingInline: 0 }}>
        <Button size="sm" onClick={save}>
          <Check className="mr-2 size-3.5" aria-hidden="true" />
          {t("ai.saveKey")}
        </Button>
        {saved && (
          <Button variant="ghost" size="sm" onClick={remove}>
            <Trash2 className="mr-2 size-3.5" aria-hidden="true" />
            {t("ai.clearKey")}
          </Button>
        )}
        <Link href="/tools?category=ai" className="text-link">
          {t("ai.tryTools")} <span aria-hidden="true">→</span>
        </Link>
      </div>
      {notice && (
        <p className="tool-note" role="status">
          <Check className="size-4" aria-hidden="true" />
          {notice}
        </p>
      )}
    </article>
  );
}

export default function AI() { const { t } = useTranslation(); usePageMeta("ai.title", "ai.copy"); const steps = ["ai.step1", "ai.step2", "ai.step3", "ai.step4", "ai.step5", "ai.step6"] as const; return <div className="site-frame page-space"><div className="page-intro"><p className="eyebrow">{t("ai.eyebrow")}</p><h1>{t("ai.title")}</h1><p>{t("ai.copy")}</p></div><section className="ai-layout"><div style={{ display: "grid", gap: 20, alignContent: "start" }}><KeySettings /><article className="setup-card"><KeyRound className="setup-icon" /><h2>{t("ai.stepsTitle")}</h2><ol>{steps.map((step, index) => <li key={step}><span>0{index + 1}</span>{t(step)}</li>)}</ol><p className="privacy-callout"><ShieldCheck className="size-4" />{t("ai.security")}</p></article></div><div><h2 className="subheading">{t("ai.providers")}</h2><div className="provider-list">{providers.map((provider) => <a key={provider.name} href={provider.url} target="_blank" rel="noopener noreferrer"><strong>{provider.name}</strong><ExternalLink className="size-4" /></a>)}</div><h2 className="subheading mt-8">{t("ai.free")}</h2><div className="voice-grid"><Link href="/tools/speech-to-text"><article><Mic className="size-5" /><h3>{t("ai.speech")}</h3></article></Link><Link href="/tools/text-to-speech"><article><Volume2 className="size-5" /><h3>{t("ai.tts")}</h3></article></Link></div></div></section></div>; }
