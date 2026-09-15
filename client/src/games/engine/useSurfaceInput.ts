/**
 * The single input funnel.
 *
 * Keyboard, mouse, trackpad, pen and touch all end up calling the same `onEvent`
 * with the same `GameEvent` shapes, so a game's rules are written once and are
 * automatically playable both ways. Pointer Events are used rather than separate
 * mouse and touch handlers, which is what makes that one code path possible.
 *
 * Two deliberate scoping decisions:
 *
 *  - The keyboard listener is attached to the play surface, never to `window`. A
 *    game therefore cannot swallow arrow keys or the space bar while the player is
 *    scrolling the page or typing in the header search. `preventDefault` is called
 *    only for a key the game actually consumed.
 *  - Held state is kept in a ref rather than React state. A paddle sampling
 *    `held.axisX()` sixty times a second must not cause sixty renders.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  type ActionId,
  type ControlSpec,
  type GameEventHandler,
  LONG_PRESS_MS,
  PAUSE_KEYS,
  RESTART_KEYS,
  SWIPE_THRESHOLD,
  resolveBindings,
} from "./actions";

export type UseSurfaceInputOptions = {
  /** Element that holds keyboard focus. Keys are only read while focus is inside it. */
  surfaceRef: React.RefObject<HTMLElement | null>;
  /** Element pointer coordinates are measured against — the board or the canvas holder. */
  fieldRef: React.RefObject<HTMLElement | null>;
  /** The session's held-key set. Owned there so the game can sample it from its tick. */
  heldRef: React.MutableRefObject<Set<ActionId>>;
  spec: ControlSpec;
  onEvent: GameEventHandler;
  /** Invoked for the pause key. The shell owns pausing, not the game. */
  onPause: () => void;
  /** Invoked for the restart key. Suppressed in games that take letter input. */
  onRestart: () => void;
  /**
   * Invoked by Space or Enter while play is stopped, so the overlay showing on the
   * board — start, resume, play again — can be resolved without reaching for a button.
   */
  onConfirm: () => void;
  /**
   * When false, held state is cleared and no events are produced. Used while a game
   * is over, so a stuck key cannot drive a finished board.
   */
  enabled: boolean;
};

export function useSurfaceInput(options: UseSurfaceInputOptions) {
  const { surfaceRef, fieldRef, heldRef, spec, onEvent, onPause, onRestart, onConfirm, enabled } = options;

  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;
  const pauseRef = useRef(onPause);
  pauseRef.current = onPause;
  const restartRef = useRef(onRestart);
  restartRef.current = onRestart;
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;

  const bindings = useMemo(() => resolveBindings(spec), [spec]);
  const heldActions = useMemo(() => new Set(spec.held ?? []), [spec.held]);

  /** Called by the on-screen buttons so a touch press behaves exactly like a keypress. */
  const pressAction = useCallback(
    (id: ActionId, down: boolean) => {
      if (!enabled) return;
      if (down) {
        heldRef.current.add(id);
        eventRef.current({ kind: "action", id, repeat: false, source: "touchControl" });
      } else {
        heldRef.current.delete(id);
      }
    },
    [enabled, heldRef],
  );

  /** Called by the on-screen keypad and letter keyboard. */
  const pressText = useCallback(
    (value: string) => {
      if (!enabled) return;
      eventRef.current({ kind: "text", value, source: "touchControl" });
    },
    [enabled],
  );

  // Keyboard.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const matchAction = (event: KeyboardEvent): ActionId | null => {
      for (const binding of bindings) {
        if (binding.keys.includes(event.code)) return binding.id;
      }
      return null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      // Pause and restart are the shell's, and stay available even when the game is
      // over — that is how a player gets out of a finished board with the keyboard.
      if (PAUSE_KEYS.includes(event.code)) {
        event.preventDefault();
        pauseRef.current();
        return;
      }
      // `R` is a letter, so in a word game it is a guess and not a restart.
      if (!spec.letters && RESTART_KEYS.includes(event.code) && !event.repeat) {
        event.preventDefault();
        restartRef.current();
        return;
      }

      if (!enabled) {
        // Space and Enter resolve whichever overlay is on the board — start, resume,
        // play again — so a keyboard player never has to tab away from it to get the
        // game moving. The game's own bindings take these keys back once play begins.
        if ((event.code === "Space" || event.code === "Enter") && !event.repeat) {
          event.preventDefault();
          confirmRef.current();
        }
        return;
      }

      if (spec.letters && /^Key[A-Z]$/.test(event.code)) {
        event.preventDefault();
        eventRef.current({ kind: "text", value: event.code.slice(3), source: "keyboard" });
        return;
      }
      if (spec.keypad) {
        const digit = /^(?:Digit|Numpad)([0-9])$/.exec(event.code);
        if (digit) {
          event.preventDefault();
          // The group always participates on a match; `?? ""` is type-level only.
          eventRef.current({ kind: "text", value: digit[1] ?? "", source: "keyboard" });
          return;
        }
      }

      const action = matchAction(event);
      if (!action) return;
      // Only reached for a key this game declared, so the page never loses its own
      // arrow-key scrolling to a game that does not use arrows.
      event.preventDefault();
      if (heldActions.has(action)) heldRef.current.add(action);
      eventRef.current({ kind: "action", id: action, repeat: event.repeat, source: "keyboard" });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const action = matchAction(event);
      if (action) heldRef.current.delete(action);
    };

    // A key held down while the player tabs away would otherwise stay held forever,
    // and the paddle would drift on its own when they came back.
    const onBlur = () => heldRef.current.clear();

    surface.addEventListener("keydown", onKeyDown);
    surface.addEventListener("keyup", onKeyUp);
    surface.addEventListener("blur", onBlur);
    window.addEventListener("blur", onBlur);
    // Copied up front: the cleanup runs after unmount, when the ref object may
    // already point elsewhere, so it must not read `.current` late.
    const held = heldRef.current;
    return () => {
      surface.removeEventListener("keydown", onKeyDown);
      surface.removeEventListener("keyup", onKeyUp);
      surface.removeEventListener("blur", onBlur);
      window.removeEventListener("blur", onBlur);
      held.clear();
    };
  }, [surfaceRef, bindings, heldActions, spec.letters, spec.keypad, enabled, heldRef]);

  // Pointer: mouse, trackpad, pen and touch through one set of handlers.
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const wantsPointer = spec.pointer && spec.pointer !== "none";
    if (!wantsPointer && !spec.swipe) return;

    let activeId: number | null = null;
    let startX = 0;
    let startY = 0;
    let alt = false;
    let longPressTimer = 0;
    let swiped = false;

    const fraction = (event: PointerEvent) => {
      const rect = field.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
      return {
        x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      };
    };

    const clearLongPress = () => {
      if (longPressTimer) window.clearTimeout(longPressTimer);
      longPressTimer = 0;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (activeId !== null) return;
      if (!enabled) return;
      // Only the two mouse buttons a game can meaningfully use.
      if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2) return;

      activeId = event.pointerId;
      alt = event.pointerType === "mouse" && event.button === 2;
      swiped = false;
      const point = fraction(event);
      startX = point.x;
      startY = point.y;

      // Keeps the drag alive when the finger leaves the board, and moves focus to the
      // surface so the keyboard works immediately after a tap without a second click.
      try {
        field.setPointerCapture(event.pointerId);
      } catch {
        // Capture is best-effort; the plain move handler still works without it.
      }
      surfaceRef.current?.focus({ preventScroll: true });

      if (spec.longPress && !alt) {
        longPressTimer = window.setTimeout(() => {
          longPressTimer = 0;
          alt = true;
          eventRef.current({ kind: "point", phase: "start", x: startX, y: startY, alt: true, source: "pointer" });
        }, LONG_PRESS_MS);
      } else if (wantsPointer) {
        eventRef.current({ kind: "point", phase: "start", x: point.x, y: point.y, alt, source: "pointer" });
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activeId) return;
      const point = fraction(event);
      const travelled = Math.hypot(point.x - startX, point.y - startY);
      // Movement means this was a drag or a flick, not a long press.
      if (longPressTimer && travelled > 0.02) clearLongPress();
      if (spec.pointer === "drag") {
        eventRef.current({ kind: "point", phase: "move", x: point.x, y: point.y, alt, source: "pointer" });
      }
      if (spec.swipe && !swiped && travelled >= SWIPE_THRESHOLD) {
        swiped = true;
        clearLongPress();
        const dx = point.x - startX;
        const dy = point.y - startY;
        const id = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
        eventRef.current({ kind: "swipe", id, source: "pointer" });
      }
    };

    const finish = (event: PointerEvent, phase: "end" | "cancel") => {
      if (event.pointerId !== activeId) return;
      clearLongPress();
      activeId = null;
      try {
        field.releasePointerCapture(event.pointerId);
      } catch {
        // Already released, for instance when the pointer was cancelled by the OS.
      }
      // A flick has already been reported as a swipe; reporting it as a tap too would
      // make a swipe-and-tap game act on both.
      if (!wantsPointer || (swiped && phase === "end")) return;
      const point = fraction(event);
      eventRef.current({ kind: "point", phase, x: point.x, y: point.y, alt, source: "pointer" });
    };

    const onPointerUp = (event: PointerEvent) => finish(event, "end");
    const onPointerCancel = (event: PointerEvent) => finish(event, "cancel");

    // A right-click is the secondary action in Minesweeper, so the browser menu must
    // not open on top of the board. Scoped to the board only.
    const onContextMenu = (event: Event) => {
      if (spec.longPress) event.preventDefault();
    };

    field.addEventListener("pointerdown", onPointerDown);
    field.addEventListener("pointermove", onPointerMove);
    field.addEventListener("pointerup", onPointerUp);
    field.addEventListener("pointercancel", onPointerCancel);
    field.addEventListener("contextmenu", onContextMenu);
    return () => {
      clearLongPress();
      field.removeEventListener("pointerdown", onPointerDown);
      field.removeEventListener("pointermove", onPointerMove);
      field.removeEventListener("pointerup", onPointerUp);
      field.removeEventListener("pointercancel", onPointerCancel);
      field.removeEventListener("contextmenu", onContextMenu);
    };
  }, [fieldRef, surfaceRef, spec.pointer, spec.swipe, spec.longPress, enabled]);

  // Clearing on disable stops a key that was down at game-over from driving the board
  // if the player restarts without letting go.
  useEffect(() => {
    if (!enabled) heldRef.current.clear();
  }, [enabled, heldRef]);

  return { pressAction, pressText };
}
