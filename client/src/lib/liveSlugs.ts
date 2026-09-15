/**
 * The slugs whose page is a live instrument (timers, canvases, recorders) rather than
 * a form/text bench. Kept in a plain module with no React import so `runTool`, the
 * guide builder and the node-env test sweep can all see the same list without pulling
 * component code into a non-DOM context.
 *
 * `components/tools/live/index.tsx` is the registry that actually renders them;
 * `live.test.ts` asserts the two lists stay in sync, so this cannot silently drift.
 */
export const LIVE_TOOL_SLUGS: ReadonlySet<string> = new Set([
  "countdown-timer",
  "stopwatch",
  "world-clock",
  "timer-with-alarm",
  "pomodoro-timer",
  "typing-speed-test",
  "reaction-time-test",
  "decision-wheel",
  "list-wheel-picker",
  "screen-ruler",
  "fullscreen-dead-pixel-test",
  "whiteboard",
  "keycode-info",
  "benchmark-builder",
  "favicon-generator",
  "html-wysiwyg-editor",
  "camera-recorder",
  "screen-audio-recorder",
  "qr-file-transfer",
]);

export function isLiveTool(slug: string): boolean {
  return LIVE_TOOL_SLUGS.has(slug);
}
