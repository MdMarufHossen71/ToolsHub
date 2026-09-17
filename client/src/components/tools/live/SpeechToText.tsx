/** Browser-native dictation: no key, no upload, nothing leaves the device. */
import { useEffect, useRef, useState } from "react";
import { Check, Clipboard, Mic, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/AppSettingsContext";

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

function recognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  const scoped = window as unknown as Record<string, unknown>;
  const Ctor = scoped.SpeechRecognition ?? scoped.webkitSpeechRecognition;
  return typeof Ctor === "function" ? (Ctor as new () => SpeechRecognitionInstance) : null;
}

export function SpeechToText() {
  const { t } = useTranslation();
  const [supported] = useState(() => recognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState("en-US");
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [copied, setCopied] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const stopIntent = useRef(false);

  // The recognizer dies with the component: no hot mic left behind on navigation.
  useEffect(
    () => () => {
      stopIntent.current = true;
      try {
        recognitionRef.current?.stop();
      } catch {
        // Already stopped.
      }
    },
    [],
  );

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

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

  const toggle = () => {
    if (listening) {
      stopIntent.current = true;
      try {
        recognitionRef.current?.stop();
      } catch {
        // Already stopped.
      }
      setListening(false);
      setInterim("");
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;
    stopIntent.current = false;
    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";
        if (!result) continue;
        if (result.isFinal) setFinalText((current) => `${current}${transcript} `.trimStart());
        else interimText += transcript;
      }
      setInterim(interimText);
    };
    recognition.onerror = () => {
      setListening(false);
      setInterim("");
    };
    recognition.onend = () => {
      // The service stops by itself on pauses; only a deliberate stop ends it.
      if (stopIntent.current) {
        setListening(false);
        setInterim("");
        return;
      }
      try {
        recognition.start();
      } catch {
        setListening(false);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(finalText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="live-stage live-stage-stretch">
      <div className="tool-form">
        <label className="tool-field">
          <span>{t("tool.live.language")}</span>
          <select value={lang} onChange={(event) => setLang(event.target.value)} aria-label={t("tool.live.language")} disabled={listening}>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="bn-BD">বাংলা (BD)</option>
          </select>
        </label>
      </div>
      <div className="bench-actions bench-actions-center">
        <Button size="sm" onClick={toggle} aria-pressed={listening}>
          <Mic className="mr-2 size-3.5" aria-hidden="true" />
          {listening ? t("tool.live.stop") : t("tool.live.listen")}
        </Button>
        {finalText && (
          <>
            <Button variant="outline" size="sm" onClick={() => void copy()}>
              {copied ? <Check className="mr-2 size-3.5" aria-hidden="true" /> : <Clipboard className="mr-2 size-3.5" aria-hidden="true" />}
              {t("common.copy")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFinalText("");
                setInterim("");
              }}
            >
              <Trash2 className="mr-2 size-3.5" aria-hidden="true" />
              {t("common.clear")}
            </Button>
          </>
        )}
      </div>
      <div className="tool-form">
        <label className="tool-field tool-field-wide">
          <span>{t("tool.live.transcript")}</span>
          <textarea
            value={listening && interim ? `${finalText} ${interim}` : finalText}
            onChange={(event) => setFinalText(event.target.value)}
            className="tool-textarea"
            spellCheck={false}
            aria-label={t("tool.live.transcript")}
            aria-live="polite"
          />
        </label>
      </div>
      {listening && (
        <p className="tool-note" role="status">
          {t("tool.live.listening")}
        </p>
      )}
    </div>
  );
}
