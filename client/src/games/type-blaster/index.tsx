/**
 * Type Blaster — falling words destroyed by typing, on canvas.
 *
 * Owns only its rules: three lanes of descending words, first-letter
 * targeting with prefix matching, three lives for words that land, and
 * speed that climbs with every five kills. Letters arrive as `text` from
 * typing or the on-screen pad; erase drops the current target. Letter input
 * suppresses `R` restart by design, so fast typing can never reset the run.
 */
import { useCallback, useMemo, useRef } from "react";
import {
  GameShell,
  useGameCanvas,
  useGameLoop,
  useGamePalette,
  useGameSession,
  withAlpha,
  type CanvasSize,
  type ControlSpec,
  type GameEvent,
} from "@/games/engine";
import type { GameModuleProps } from "@/games/registry";

const SPEC: ControlSpec = { actions: ["erase"], surface: "canvas", letters: true };

const LANES = 3;
const START_LIVES = 3;
const KILLS_PER_LEVEL = 5;
const BASE_FALL = 28;
const FALL_PER_LEVEL = 5;
const BASE_SPAWN = 2.4;
const MIN_SPAWN = 0.9;

export const WORDS = [
  "CODE", "PLAY", "FAST", "WORD", "GAME", "TYPE", "FALL", "FIRE",
  "LIGHT", "STORM", "RIVER", "TIGER", "CLOUD", "DANCE", "EAGLE", "PIANO",
  "PLANET", "GARDEN", "BRIDGE", "MARKET", "ROBOT", "SNAKE", "TRAIN", "WHALE",
  "WINDOW", "WATER", "STONE", "MOUSE", "BREAD", "CHAIR", "TABLE", "PHONE",
  "CLOCK", "DRUM", "EARTH", "FLAME", "GLOBE", "HEART", "MUSIC", "DREAM",
  "LAUGH", "FIELD", "HOUSE", "MONEY", "PARTY", "SWEET", "BEACH", "SMILE",
];

type Falling = { text: string; lane: number; y: number; typed: number };

type BlastState = {
  words: Falling[];
  lives: number;
  score: number;
  level: number;
  kills: number;
  sinceSpawn: number;
};

const startState = (): BlastState => ({ words: [], lives: START_LIVES, score: 0, level: 1, kills: 0, sinceSpawn: 1 });

export function pickWord(avoid: Set<string>, random: () => number = Math.random): string {
  // `avoid` holds initials (the caller maps `w.text[0]`), so filtering on the whole
  // word never matched and the "avoid recently used initials" rule did nothing.
  const pool = WORDS.filter((w) => !avoid.has(w[0]));
  return pool[Math.floor(random() * pool.length)] ?? "CODE";
}

export default function TypeBlaster({ slug, title }: GameModuleProps) {
  const palette = useGamePalette();
  const state = useRef<BlastState>(startState());
  const target = useRef<Falling | null>(null);

  const session = useGameSession({
    slug,
    onRestart: () => {
      state.current = startState();
      target.current = null;
    },
  });

  const { reducedMotion } = session;

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const current = state.current;
      context.clearRect(0, 0, size.width, size.height);
      context.fillStyle = palette.sunken;
      context.fillRect(0, 0, size.width, size.height);

      const floorY = size.height - 26;
      context.strokeStyle = withAlpha(palette.danger, 0.8);
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(8, floorY + 0.5);
      context.lineTo(size.width - 8, floorY + 0.5);
      context.stroke();

      const fontSize = Math.max(13, size.width / 22);
      context.font = `600 ${fontSize}px "Space Grotesk", system-ui, sans-serif`;
      context.textBaseline = "middle";
      for (const word of current.words) {
        const x = ((word.lane + 0.5) / LANES) * size.width;
        const y = word.y * size.height;
        const done = word.text.slice(0, word.typed);
        const rest = word.text.slice(word.typed);
        const isTarget = target.current === word;
        // Typed prefix in the action colour, the rest in body text: progress
        // reads as a shape change, not a colour alone.
        context.fillStyle = palette.primary;
        context.fillText(done, x, y);
        const doneWidth = context.measureText(done).width;
        context.fillStyle = isTarget ? palette.text : withAlpha(palette.text, 0.75);
        context.fillText(rest, x + doneWidth, y);
        if (isTarget && !reducedMotion) {
          context.strokeStyle = withAlpha(palette.primary, 0.6);
          context.lineWidth = 1.5;
          const width = context.measureText(word.text).width;
          context.strokeRect(x - 6, y - fontSize * 0.75, width + 12, fontSize * 1.5);
        }
      }
    },
    [palette, reducedMotion],
  );

  const { canvasRef, redraw } = useGameCanvas({ aspect: 100 / 135, maxHeight: 560, draw, repaintKey: session.repaintKey });

  useGameLoop(
    session,
    (dt) => {
      const current = state.current;
      const fall = (BASE_FALL + (current.level - 1) * FALL_PER_LEVEL) * dt;
      const floor = 1 - 26 / 480;
      current.sinceSpawn += dt;
      const interval = Math.max(MIN_SPAWN, BASE_SPAWN - (current.level - 1) * 0.18);
      if (current.sinceSpawn >= interval && current.words.length < 6) {
        current.sinceSpawn = 0;
        const avoid = new Set(current.words.map((w) => w.text[0]));
        const text = pickWord(avoid);
        current.words.push({ text, lane: Math.floor(Math.random() * LANES), y: 0, typed: 0 });
      }
      let landed = false;
      current.words = current.words.filter((word) => {
        word.y += fall / 480;
        if (word.y >= floor) {
          landed = true;
          if (target.current === word) target.current = null;
          return false;
        }
        return true;
      });
      if (landed) {
        current.lives -= 1;
        // A commit on every landing doubles as the re-render that refreshes
        // the lives readout below, which otherwise only moves on a kill.
        session.commit({ score: current.score, level: current.level, resources: current.kills });
        if (current.lives <= 0) {
          session.end({ score: current.score, level: current.level, resources: current.kills });
          redraw();
          return;
        }
      }
      redraw();
    },
    { hz: 60 },
  );

  const onEvent = useCallback(
    (event: GameEvent) => {
      const current = state.current;
      if (event.kind === "action" && event.id === "erase") {
        target.current = null;
        redraw();
        return;
      }
      if (event.kind !== "text") return;
      const letter = event.value;
      let word = target.current;
      if (!word || !current.words.includes(word)) {
        word = current.words.find((w) => w.text[0] === letter) ?? null;
        target.current = word;
      }
      if (!word || word.text[word.typed] !== letter) return;
      word.typed += 1;
      if (word.typed >= word.text.length) {
        current.words = current.words.filter((w) => w !== word);
        target.current = null;
        current.kills += 1;
        current.score += word.text.length * 10;
        current.level = Math.floor(current.kills / KILLS_PER_LEVEL) + 1;
        session.commit({ score: current.score, level: current.level, resources: current.kills });
      }
      redraw();
    },
    [redraw, session],
  );

  // Lives live in the loop ref (the tick needs them without renders); the
  // commit on every kill and landing re-renders, so this readout stays fresh.
  const readouts = useMemo(
    () => [
      { labelKey: "game.lives" as const, value: state.current.lives },
      { labelKey: "game.level" as const, value: session.run.level ?? 1 },
    ],
    [session.run.score, session.run.level],
  );

  return (
    <GameShell session={session} spec={SPEC} title={title} readouts={readouts} announcement={undefined} onEvent={onEvent}>
      <canvas ref={canvasRef} className="game-canvas" />
    </GameShell>
  );
}
