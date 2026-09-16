/**
 * The frame every game is played inside.
 *
 * Everything in the Phase 3 brief that is not a game's own rules lives here, once,
 * so no individual game can get it wrong: a focusable play surface with page
 * gestures suppressed inside it and nowhere else, a visible and localized key
 * legend, on-screen touch controls sized for a finger, pause and restart, a
 * screen-reader status line, and the score readout.
 *
 * Tab order note: the on-screen touch buttons and the buttons inside the overlays
 * carry `tabIndex={-1}`. Each one duplicates a physical key that is already printed
 * in the legend below the board, so leaving them out of the tab sequence costs a
 * keyboard player nothing and keeps that sequence short. They stay in the
 * accessibility tree, so a screen reader on a phone can still find and activate
 * them by touch.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { TranslationKey } from "@/i18n/translations";
import {
  ACTION_LABEL_KEYS,
  PAUSE_KEYS,
  RESTART_KEYS,
  keyCapLabel,
  resolveBindings,
  type ActionId,
  type ControlSpec,
  type GameEventHandler,
} from "./actions";
import { useSurfaceInput } from "./useSurfaceInput";
import type { GameSession, RunValues } from "./useGameSession";

export type Readout = { labelKey: TranslationKey; value: string | number };

export type GameShellProps = {
  session: GameSession;
  spec: ControlSpec;
  /** Accessible name for the play surface — the game's own name. */
  title: string;
  /** Extra readouts beside score and best: level, lives, time, lines. */
  readouts?: Readout[];
  /**
   * A short localized sentence announced politely when it changes. Leave undefined
   * during fast-paced play; the shell already announces pause and game over.
   * Explicit `undefined` is allowed: most games compute it conditionally.
   */
  announcement?: string | undefined;
  onEvent: GameEventHandler;
  /** The board or canvas. Pointer coordinates are measured against this element's box. */
  children: React.ReactNode;
};

/** The 1–9 pad, with erase last. Digits are the same glyphs in both languages here. */
const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const DPAD_GLYPHS: Record<string, string> = { up: "▲", down: "▼", left: "◀", right: "▶" };
const ACTION_GLYPHS: Record<ActionId, string> = {
  up: "▲",
  down: "▼",
  left: "◀",
  right: "▶",
  primary: "●",
  secondary: "◆",
  rotateCw: "↻",
  rotateCcw: "↺",
  drop: "⤓",
  erase: "⌫",
};

const fullscreenSupported = () =>
  typeof document !== "undefined" && (document.fullscreenEnabled ?? false) && typeof Element.prototype.requestFullscreen === "function";

export function GameShell({ session, spec, title, readouts, announcement, onEvent, children }: GameShellProps) {
  const { t } = useTranslation();
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const { phase } = session;
  const inputEnabled = phase === "playing";

  // Whatever the overlay currently offers. Bound to Space and Enter while play is
  // stopped, which is what `game.readyCopy` promises the player.
  const confirm = useCallback(() => {
    if (phase === "over") session.restart();
    else if (phase === "paused") session.resume();
    else if (phase === "ready") session.start();
  }, [phase, session]);

  const { pressAction, pressText } = useSurfaceInput({
    surfaceRef: session.surfaceRef,
    fieldRef,
    heldRef: session.heldRef,
    spec,
    onEvent,
    onPause: session.togglePause,
    onRestart: session.restart,
    onConfirm: confirm,
    enabled: inputEnabled,
  });

  // Keyboard reaches the game without a click first. `preventScroll` matters because
  // the board sits below the page heading and a plain focus would jump the viewport.
  useEffect(() => {
    session.surfaceRef.current?.focus({ preventScroll: true });
  }, [session.surfaceRef]);

  // When play starts or resumes, the keyboard belongs to the board again: the
  // toolbar buttons and the on-screen controls otherwise keep click focus, and
  // the next arrow press would do nothing until the player re-clicks the board.
  useEffect(() => {
    if (phase === "playing") session.surfaceRef.current?.focus({ preventScroll: true });
  }, [phase, session.surfaceRef]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void stageRef.current?.requestFullscreen().catch(() => undefined);
  }, []);

  // Restart and Forget sit side by side, and Forget erases the high score while
  // Restart keeps it. Both arm on first press and fire on the second, so a slip
  // can never wipe a best. The label change is on the focused button, so it is
  // announced; the arm expires after a few seconds.
  const [confirming, setConfirming] = useState<"restart" | "forget" | null>(null);
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(null), 3000);
    return () => window.clearTimeout(timer);
  }, [confirming]);
  const askRestart = useCallback(() => {
    if (confirming === "restart") {
      setConfirming(null);
      session.restart();
    } else {
      setConfirming("restart");
    }
  }, [confirming, session]);
  const askForget = useCallback(() => {
    if (confirming === "forget") {
      setConfirming(null);
      session.forget();
    } else {
      setConfirming("forget");
    }
  }, [confirming, session]);

  const bindings = useMemo(() => resolveBindings(spec), [spec]);

  const legend = useMemo(() => {
    const rows = bindings.map(({ id, keys }) => ({
      label: t(ACTION_LABEL_KEYS[id]),
      caps: keys.map((key) => keyCapLabel(key, t)).filter((cap): cap is string => cap !== null),
    }));
    if (spec.letters) rows.push({ label: t("control.letters"), caps: ["A", "–", "Z"] });
    if (spec.keypad) rows.push({ label: t("control.digits"), caps: ["1", "–", "9"] });
    rows.push({ label: t("game.pause"), caps: PAUSE_KEYS.map((key) => keyCapLabel(key, t)).filter((cap): cap is string => cap !== null) });
    if (!spec.letters) {
      rows.push({ label: t("game.restart"), caps: RESTART_KEYS.map((key) => keyCapLabel(key, t)).filter((cap): cap is string => cap !== null) });
    }
    return rows.filter((row) => row.caps.length > 0);
  }, [bindings, spec.letters, spec.keypad, t]);

  const stats: Readout[] = [
    { labelKey: "game.score", value: session.run.score },
    { labelKey: "game.best", value: session.best },
    ...(readouts ?? []),
  ];

  // Only phase changes and whatever the game chooses to say. The score is not read
  // out continuously, which would make a fast game unusable with a screen reader.
  // The game's own announcement is dropped once the run is over, so the final line is
  // the result and not the result followed by a stale level.
  const liveMessage = [
    phase === "paused" ? (session.pausedByVisibility ? t("game.pausedHidden") : t("game.paused")) : "",
    phase === "over" ? t("game.overWithScore", { score: session.run.score, best: session.best }) : "",
    phase === "over" ? "" : (announcement ?? ""),
  ]
    .filter(Boolean)
    .join(" ");

  const overlay =
    phase === "ready"
      ? { key: "ready" as const, title: t("game.readyTitle"), copy: t("game.readyCopy"), action: t("game.start"), onAction: session.start }
      : phase === "paused"
        ? {
            key: "paused" as const,
            title: t("game.paused"),
            copy: session.pausedByVisibility ? t("game.pausedHidden") : t("game.pausedCopy"),
            action: t("game.resume"),
            onAction: session.resume,
          }
        : phase === "over"
          ? { key: "over" as const, title: t("game.over"), copy: t("game.overCopy"), action: t("game.playAgain"), onAction: session.restart }
          : null;

  return (
    <div className="game-stage" ref={stageRef} data-phase={phase} data-reduced-motion={session.reducedMotion ? "true" : "false"}>
      {/* `role="application"` for a canvas game so the screen reader forwards arrow
          keys instead of using them to browse. A board game keeps its native grid and
          button semantics, which are far more useful than raw key forwarding. */}
      <div
        className="game-surface"
        ref={session.surfaceRef}
        tabIndex={0}
        role={spec.surface === "canvas" ? "application" : "group"}
        aria-label={title}
        aria-describedby="game-legend"
        data-phase={phase}
      >
        <div className="game-field" ref={fieldRef}>
          {children}
        </div>
        {overlay && (
          <div className="game-overlay" data-overlay={overlay.key}>
            <strong>{overlay.title}</strong>
            <p>{overlay.copy}</p>
            {/* Focusable and autofocused: the overlay is the game at this moment,
                and Space/Enter also confirm — both paths do the same thing. */}
            <button type="button" className="game-overlay-action" autoFocus onClick={overlay.onAction}>
              {overlay.action}
            </button>
          </div>
        )}
      </div>

      <div className="game-toolbar">
        {phase === "playing" ? (
          <Button variant="outline" size="sm" onClick={session.pause}>
            <Pause className="mr-2 size-4" aria-hidden="true" />
            {t("game.pause")}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={phase === "over" ? session.restart : session.start}>
            <Play className="mr-2 size-4" aria-hidden="true" />
            {phase === "paused" ? t("game.resume") : phase === "over" ? t("game.playAgain") : t("game.start")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={askRestart}>
          <RotateCcw className="mr-2 size-4" aria-hidden="true" />
          {confirming === "restart" ? t("game.sureRestart") : t("game.restart")}
        </Button>
        {/* Deleting the save is a separate action from restarting, because restarting
            keeps the high score and this does not. */}
        <Button variant="ghost" size="sm" onClick={askForget}>
          <Trash2 className="mr-2 size-4" aria-hidden="true" />
          {confirming === "forget" ? t("game.sureForget") : t("game.forget")}
        </Button>
        {fullscreenSupported() && (
          <Button variant="ghost" size="sm" onClick={toggleFullscreen} aria-pressed={fullscreen}>
            {fullscreen ? <Minimize2 className="mr-2 size-4" aria-hidden="true" /> : <Maximize2 className="mr-2 size-4" aria-hidden="true" />}
            {fullscreen ? t("game.exitFullscreen") : t("game.fullscreen")}
          </Button>
        )}
      </div>

      {/* Directly under the board and above the readouts. On a phone the d-pad and the
          board have to be on screen together, and putting the stats between them pushed
          the d-pad roughly 250 px further down — off screen on a short viewport. */}
      <TouchControls spec={spec} pressAction={pressAction} pressText={pressText} />

      {/* Not a live region: a screen reader user can read these at will, but a score
          changing ten times a second must not interrupt them. */}
      <div className="game-stats">
        {stats.map((stat) => (
          <div key={stat.labelKey}>
            <small>{t(stat.labelKey)}</small>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>

      <div className="game-legend" id="game-legend">
        <h2>{t("game.controls.title")}</h2>
        <dl>
          {legend.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                {row.caps.map((cap) => (
                  <kbd key={cap}>{cap}</kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <p>{t("game.touchHint")}</p>
      </div>

      {session.storageWarning && (
        <p className="game-storage-warning" role="alert">
          {t("game.storageFull")}
        </p>
      )}
    </div>
  );
}

/**
 * The on-screen controls.
 *
 * Every button is at least 48 px square with 8 px of gap, comfortably past the
 * 44 px minimum in the brief, and press is handled on `pointerdown` rather than
 * `click` so a tap registers without the browser's delay.
 */
function TouchControls({
  spec,
  pressAction,
  pressText,
}: {
  spec: ControlSpec;
  pressAction: (id: ActionId, down: boolean) => void;
  pressText: (value: string) => void;
}) {
  const { t } = useTranslation();
  const heldSet = useMemo(() => new Set(spec.held ?? []), [spec.held]);

  const directions = spec.dpad ?? "none";
  const DPAD_LAYOUT: Record<string, ActionId[]> = {
    four: ["up", "left", "right", "down"],
    horizontal: ["left", "right"],
    vertical: ["up", "down"],
    none: [],
  };
  // Intersected with what the game actually consumes, so a game that wants a d-pad but
  // only reads three of the four directions — Tetris has no use for `up` — gets three
  // buttons and an empty cell rather than a fourth button that silently does nothing.
  // `.game-dpad-four` places each direction by name, so the gap closes up cleanly.
  // Every layout key exists above; `?? []` is type-level only.
  const directionIds = (DPAD_LAYOUT[directions] ?? []).filter((id) => spec.actions.includes(id));

  const buttonIds = spec.actions.filter((id) => !directionIds.includes(id) && !["up", "down", "left", "right"].includes(id));

  // A tap must not steal the keyboard: after every on-screen press, focus goes
  // back to the play surface so the next physical key still plays. `preventScroll`
  // keeps the viewport where the player's thumbs already are.
  const refocusSurface = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return;
    target.closest(".game-stage")?.querySelector<HTMLElement>(".game-surface")?.focus({ preventScroll: true });
  };

  const bind = (id: ActionId) => {
    const isHeld = heldSet.has(id);
    return {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        // Stops the tap from also reaching the board underneath and from turning into
        // a double-tap zoom.
        event.preventDefault();
        event.stopPropagation();
        // The press is registered first, and capture is best-effort. A pointer that has
        // already been released by the time this runs — a very fast tap, or a pointer
        // the browser has already cancelled — makes `setPointerCapture` throw
        // `NotFoundError`, and losing the press because of a capture that was only ever
        // an optimisation would mean a tap that does nothing.
        pressAction(id, true);
        refocusSurface(event.currentTarget);
        const target = event.currentTarget;
        try {
          target.setPointerCapture?.(event.pointerId);
        } catch {
          // No live pointer to capture. The press already counted.
        }
      },
      onPointerUp: () => {
        if (isHeld) pressAction(id, false);
      },
      onPointerCancel: () => {
        if (isHeld) pressAction(id, false);
      },
      onPointerLeave: () => {
        if (isHeld) pressAction(id, false);
      },
    };
  };

  if (directionIds.length === 0 && buttonIds.length === 0 && !spec.keypad && !spec.letters) return null;

  return (
    <div className="game-touch" aria-label={t("game.touchControls")} role="group">
      {directionIds.length > 0 && (
        <div className={`game-dpad game-dpad-${directions}`}>
          {directionIds.map((id) => (
            <button key={id} type="button" tabIndex={-1} className={`game-touch-button dpad-${id}`} aria-label={t(ACTION_LABEL_KEYS[id])} {...bind(id)}>
              <span aria-hidden="true">{DPAD_GLYPHS[id]}</span>
            </button>
          ))}
        </div>
      )}

      {buttonIds.length > 0 && (
        <div className="game-action-cluster">
          {buttonIds.map((id) => (
            <button key={id} type="button" tabIndex={-1} className="game-touch-button game-touch-wide" aria-label={t(ACTION_LABEL_KEYS[id])} {...bind(id)}>
              <span aria-hidden="true">{ACTION_GLYPHS[id]}</span>
              <small>{t(ACTION_LABEL_KEYS[id])}</small>
            </button>
          ))}
        </div>
      )}

      {spec.keypad && (
        <div className="game-keypad" role="group" aria-label={t("control.digits")}>
          {KEYPAD_DIGITS.map((digit) => (
            <button
              key={digit}
              type="button"
              tabIndex={-1}
              className="game-touch-button"
              onPointerDown={(event) => {
                event.preventDefault();
                pressText(digit);
                refocusSurface(event.currentTarget);
              }}
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            tabIndex={-1}
            className="game-touch-button"
            aria-label={t("control.erase")}
            onPointerDown={(event) => {
              event.preventDefault();
              pressAction("erase", true);
              refocusSurface(event.currentTarget);
            }}
          >
            <span aria-hidden="true">⌫</span>
          </button>
        </div>
      )}

      {spec.letters && (
        <div className="game-letters" role="group" aria-label={t("control.letters")}>
          {LETTERS.map((letter) => (
            <button
              key={letter}
              type="button"
              tabIndex={-1}
              className="game-touch-button game-letter-key"
              onPointerDown={(event) => {
                event.preventDefault();
                pressText(letter);
                refocusSurface(event.currentTarget);
              }}
            >
              {letter}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type { RunValues };
