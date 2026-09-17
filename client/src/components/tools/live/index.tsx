/** Live tools render components, not request/response results. */
import type { ComponentType } from "react";
import { AlarmTimer, CountdownTimer, PomodoroTimer, Stopwatch, WorldClock } from "./Timers";
import { TypingTest } from "./TypingTest";
import { ReactionTest } from "./ReactionTest";
import { DecisionWheel, ListWheelPicker } from "./WheelTool";
import { ScreenRuler } from "./ScreenRuler";
import { PixelTest } from "./PixelTest";
import { Whiteboard } from "./Whiteboard";
import { KeycodeInfo } from "./KeycodeInfo";
import { BenchmarkBuilder } from "./Benchmark";
import { FaviconGen } from "./FaviconGen";
import { Wysiwyg } from "./Wysiwyg";
import { CameraRecorder, ScreenRecorder } from "./Recorders";
import { QrFileTransfer } from "./QrFileTransfer";
import { SpeechToText } from "./SpeechToText";
import { TextToSpeech } from "./TextToSpeech";

const liveTools: Record<string, ComponentType> = {
  "countdown-timer": CountdownTimer,
  stopwatch: Stopwatch,
  "world-clock": WorldClock,
  "timer-with-alarm": AlarmTimer,
  "pomodoro-timer": PomodoroTimer,
  "typing-speed-test": TypingTest,
  "reaction-time-test": ReactionTest,
  "decision-wheel": DecisionWheelView,
  "list-wheel-picker": ListWheelPicker,
  "screen-ruler": ScreenRuler,
  "fullscreen-dead-pixel-test": PixelTest,
  whiteboard: Whiteboard,
  "keycode-info": KeycodeInfo,
  "benchmark-builder": BenchmarkBuilder,
  "favicon-generator": FaviconGen,
  "html-wysiwyg-editor": Wysiwyg,
  "camera-recorder": CameraRecorder,
  "screen-audio-recorder": ScreenRecorder,
  "qr-file-transfer": QrFileTransfer,
  "speech-to-text": SpeechToText,
  "text-to-speech": TextToSpeech,
};

function DecisionWheelView() {
  return <DecisionWheel onDone={() => undefined} />;
}

/** Exported so a test can prove this registry and `lib/liveSlugs` cannot drift apart. */
export const liveToolSlugs = Object.keys(liveTools);

export function getLiveTool(slug: string): ComponentType | null {
  return liveTools[slug] ?? null;
}
