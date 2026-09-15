/** Live clocks: stopwatch, countdown, alarm timer, pomodoro, world clock. */
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { beep, formatClock, useNow } from "./useLive";

function Controls({
  running,
  onToggle,
  onReset,
  paused,
  onLap,
  lapDisabled,
}: {
  running: boolean;
  onToggle: () => void;
  onReset: () => void;
  paused: boolean;
  onLap?: () => void;
  lapDisabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="bench-actions bench-actions-center">
      <Button size="sm" onClick={onToggle}>
        {running ? <Pause className="mr-2 size-3.5" aria-hidden="true" /> : <Play className="mr-2 size-3.5" aria-hidden="true" />}
        {running ? t("game.pause") : paused ? t("game.resume") : t("game.start")}
      </Button>
      {onLap && (
        <Button variant="outline" size="sm" disabled={lapDisabled} onClick={onLap}>
          {t("tool.live.lap")}
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onReset}>
        <RotateCcw className="mr-2 size-3.5" aria-hidden="true" />
        {t("common.reset")}
      </Button>
    </div>
  );
}

/** Beeps once when `done` flips true. Side effects belong in effects. */
function useDoneBeep(done: boolean, repeat = 1): void {
  const announced = useRef(false);
  useEffect(() => {
    if (done && !announced.current) {
      announced.current = true;
      for (let i = 0; i < repeat; i += 1) window.setTimeout(() => beep(880, 0.35), i * 500);
    }
    if (!done) announced.current = false;
  }, [done, repeat]);
}

export function Stopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const startedAt = useRef(0);
  useNow(running, 47);
  const shown = running ? elapsed + (Date.now() - startedAt.current) / 1000 : elapsed;

  return (
    <div className="live-stage">
      <p className="live-readout" role="timer" aria-live="off">
        {formatClock(shown)}
      </p>
      <Controls
        running={running}
        paused={elapsed > 0}
        onToggle={() => {
          if (running) {
            setElapsed(shown);
            setRunning(false);
          } else {
            startedAt.current = Date.now();
            setRunning(true);
          }
        }}
        onReset={() => {
          setRunning(false);
          setElapsed(0);
          setLaps([]);
        }}
        onLap={() => {
          setLaps((current) => [...current, shown].slice(-20));
        }}
        lapDisabled={!running}
      />
      {laps.length > 0 && (
        <ol className="game-found-list laps-list">
          {laps.map((lap, i) => (
            <li key={i}>
              {i + 1}. {formatClock(lap)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function useCountdown(initialSeconds: number) {
  const [total] = useState(initialSeconds);
  const [left, setLeft] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const deadline = useRef(0);
  useNow(running, 200);
  const shown = running ? Math.max(0, (deadline.current - Date.now()) / 1000) : left;

  const start = (seconds: number) => {
    deadline.current = Date.now() + seconds * 1000;
    setLeft(seconds);
    setRunning(true);
  };
  const toggle = () => {
    if (running) {
      setLeft(Math.max(0, (deadline.current - Date.now()) / 1000));
      setRunning(false);
    } else if (left > 0) {
      deadline.current = Date.now() + left * 1000;
      setRunning(true);
    }
  };
  const reset = (to?: number) => {
    setRunning(false);
    // Reset to the minutes currently in the field, not the mount value, so an
    // edited duration is what comes back.
    setLeft(to ?? total);
  };
  return { shown, running, left, start, toggle, reset };
}

export function CountdownTimer() {
  const { t } = useTranslation();
  const countdown = useCountdown(300);
  const [minutes, setMinutes] = useState("5");
  const expired = !countdown.running && countdown.left <= 0;
  useDoneBeep(expired);
  const seconds = Math.min(86400, Math.max(1, Math.round(Number(minutes) * 60 || 300)));

  return (
    <div className="live-stage">
      <p className="live-readout" role="timer" aria-live="off">
        {formatClock(countdown.shown)}
      </p>
      <div className="bench-actions bench-actions-center">
        <Input type="number" min="1" max="1440" value={minutes} onChange={(event) => setMinutes(event.target.value)} aria-label={t("tool.live.minutes")} className="live-minutes" />
        <Button
          size="sm"
          onClick={() => {
            countdown.start(seconds);
          }}
        >
          <Play className="mr-2 size-3.5" aria-hidden="true" />
          {t("game.start")}
        </Button>
      </div>
      <Controls running={countdown.running} paused={countdown.left > 0} onToggle={countdown.toggle} onReset={() => countdown.reset(seconds)} />
    </div>
  );
}

export function AlarmTimer() {
  const { t } = useTranslation();
  const countdown = useCountdown(60);
  const [minutes, setMinutes] = useState("1");
  const done = !countdown.running && countdown.left <= 0;
  useDoneBeep(done, 2);
  const seconds = Math.min(86400, Math.max(1, Math.round(Number(minutes) * 60 || 60)));

  return (
    <div className="live-stage">
      <p className="live-readout" role={done ? "alert" : "timer"} aria-live="off">
        {done ? "⏰" : formatClock(countdown.shown)}
      </p>
      <div className="bench-actions bench-actions-center">
        <Input type="number" min="1" max="1440" value={minutes} onChange={(event) => setMinutes(event.target.value)} aria-label={t("tool.live.minutes")} className="live-minutes" />
        <Button
          size="sm"
          onClick={() => {
            countdown.start(seconds);
          }}
        >
          <Play className="mr-2 size-3.5" aria-hidden="true" />
          {t("game.start")}
        </Button>
      </div>
      <Controls running={countdown.running} paused={countdown.left > 0} onToggle={countdown.toggle} onReset={() => countdown.reset(seconds)} />
    </div>
  );
}

export function PomodoroTimer() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"work" | "break">("work");
  const [rounds, setRounds] = useState(0);
  const countdown = useCountdown(25 * 60);

  return (
    <div className="live-stage">
      {/* Phase indicator names the current block; the button below names the action
          that ends it, so "Pause" never appears on a button that starts a break. */}
      <p className="live-subreadout" role="status">
        {phase === "work" ? t("tool.live.work") : t("tool.live.break")} · ×{rounds}
      </p>
      <p className="live-readout" role="timer" aria-live="off">
        {formatClock(countdown.shown)}
      </p>
      <div className="bench-actions bench-actions-center">
        <Button
          size="sm"
          onClick={() => {
            if (phase === "work") {
              setRounds((r) => r + 1);
              setPhase("break");
              countdown.start(5 * 60);
            } else {
              setPhase("work");
              countdown.start(25 * 60);
            }
            beep();
          }}
        >
          <Play className="mr-2 size-3.5" aria-hidden="true" />
          {phase === "work" ? t("tool.live.break") : t("tool.live.work")}
        </Button>
      </div>
      <Controls running={countdown.running} paused={countdown.left > 0} onToggle={countdown.toggle} onReset={countdown.reset} />
    </div>
  );
}

const WORLD_ZONES = ["Asia/Dhaka", "UTC", "Europe/London", "America/New_York", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney", "Asia/Kolkata"];

export function WorldClock() {
  useNow(true, 1000);
  const now = new Date();
  return (
    <div className="game-choice-list">
      {WORLD_ZONES.map((zone) => {
        let time = "—";
        try {
          time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: zone }).format(now);
        } catch {
          time = "—";
        }
        return (
          <div key={zone} className="game-choice" aria-label={`${zone} ${time}`}>
            <strong>{zone.replace("_", " ")}</strong> · {time}
          </div>
        );
      })}
    </div>
  );
}
