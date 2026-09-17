/** Browser-native speech: device voices read text aloud, nothing is uploaded. */
import { useEffect, useState } from "react";
import { Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/contexts/AppSettingsContext";

type VoiceLike = { name: string; lang: string; voiceURI: string };

function speech(): SpeechSynthesis | null {
  if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return null;
  return window.speechSynthesis;
}

export function TextToSpeech() {
  const { t } = useTranslation();
  const [supported] = useState(() => speech() !== null);
  const [voices, setVoices] = useState<VoiceLike[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [rate, setRate] = useState("1");
  const [text, setText] = useState(() => "Hello! This is ToolsHub reading aloud.");
  const [speaking, setSpeaking] = useState(false);

  // Voices arrive asynchronously in most browsers; refresh when they land, and
  // stop any speech on navigation.
  useEffect(() => {
    const synth = speech();
    if (!synth) return;
    const load = () => {
      const found = synth.getVoices().map((voice) => ({ name: voice.name, lang: voice.lang, voiceURI: voice.voiceURI }));
      setVoices(found);
      setVoiceURI((current) => current || found[0]?.voiceURI || "");
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => {
      synth.removeEventListener("voiceschanged", load);
      synth.cancel();
    };
  }, []);

  if (!supported) {
    return (
      <div className="live-stage">
        <p className="result-empty" role="note">
          <span className="result-empty-icon" aria-hidden="true">✦</span>
          <span>{t("tool.live.unsupported")}</span>
        </p>
      </div>
    );
  }

  const speak = () => {
    const synth = speech();
    const utteranceText = text.trim();
    if (!synth || !utteranceText) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(utteranceText);
    const voice = synth.getVoices().find((candidate) => candidate.voiceURI === voiceURI);
    if (voice) utterance.voice = voice;
    const speed = Math.min(Math.max(Number(rate) || 1, 0.5), 2);
    utterance.rate = speed;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  };

  const stop = () => {
    speech()?.cancel();
    setSpeaking(false);
  };

  return (
    <div className="live-stage live-stage-stretch">
      <div className="tool-form">
        <label className="tool-field tool-field-wide">
          <span>{t("tool.input")}</span>
          <textarea value={text} onChange={(event) => setText(event.target.value)} className="tool-textarea" spellCheck={false} aria-label={t("tool.input")} />
        </label>
        <label className="tool-field">
          <span>{t("tool.live.voice")}</span>
          <select value={voiceURI} onChange={(event) => setVoiceURI(event.target.value)} aria-label={t("tool.live.voice")}>
            {voices.length === 0 && <option value="">{t("tool.live.voice")}</option>}
            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name} ({voice.lang})
              </option>
            ))}
          </select>
        </label>
        <label className="tool-field">
          <span>{t("tool.live.rate")} — {rate}×</span>
          <span className="tool-range-row">
            <input type="range" value={rate} min="0.5" max="2" step="0.1" onChange={(event) => setRate(event.target.value)} aria-label={t("tool.live.rate")} />
            <Input type="number" value={rate} min="0.5" max="2" step="0.1" onChange={(event) => setRate(event.target.value)} aria-label={t("tool.live.rate")} />
          </span>
        </label>
      </div>
      <div className="bench-actions bench-actions-center">
        {speaking ? (
          <Button size="sm" onClick={stop}>
            <Square className="mr-2 size-3.5" aria-hidden="true" />
            {t("tool.live.stop")}
          </Button>
        ) : (
          <Button size="sm" onClick={speak} disabled={!text.trim()}>
            <Volume2 className="mr-2 size-3.5" aria-hidden="true" />
            {t("tool.live.speak")}
          </Button>
        )}
      </div>
    </div>
  );
}
