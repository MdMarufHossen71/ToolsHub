// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppSettingsProvider } from "@/contexts/AppSettingsContext";
import { SpeechToText } from "./SpeechToText";
import { TextToSpeech } from "./TextToSpeech";

function renderWithSettings(element: React.ReactNode) {
  return render(<AppSettingsProvider>{element}</AppSettingsProvider>);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SpeechToText", () => {
  it("says plainly when the browser has no recognizer", () => {
    renderWithSettings(<SpeechToText />);
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("dictates final transcripts into an editable field", async () => {
    const user = userEvent.setup();
    class FakeRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "hello" } }] });
      }
      stop() {
        this.onend?.();
      }
    }
    vi.stubGlobal("SpeechRecognition", undefined);
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    renderWithSettings(<SpeechToText />);
    await user.click(screen.getByRole("button", { name: "Listen" }));
    expect(await screen.findByDisplayValue("hello")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  });
});

describe("TextToSpeech", () => {
  it("says plainly when the browser has no voices", () => {
    renderWithSettings(<TextToSpeech />);
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("speaks the text with the chosen voice and rate", async () => {
    const user = userEvent.setup();
    const spoken: Array<{ text: string; rate: number; voice?: unknown }> = [];
    const voice = { name: "Test", lang: "en-US", voiceURI: "test-voice" };
    class FakeUtterance {
      text: string;
      voice: unknown;
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    const synth = {
      getVoices: () => [voice],
      speak: (utterance: { text: string; rate: number; voice: unknown; onend: (() => void) | null }) => {
        spoken.push({ text: utterance.text, rate: utterance.rate, voice: utterance.voice });
        utterance.onend?.();
      },
      cancel: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    renderWithSettings(<TextToSpeech />);
    expect(await screen.findByText("Test (en-US)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Speak" }));
    expect(spoken).toHaveLength(1);
    expect(spoken[0]?.text).toContain("ToolsHub");
    expect(spoken[0]?.rate).toBe(1);
    expect(spoken[0]?.voice).toBe(voice);
  });
});
