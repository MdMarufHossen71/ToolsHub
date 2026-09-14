/**
 * Builds the "How to use" steps for a tool page.
 *
 * The steps are derived from what the tool actually is — its schema fields, whether it
 * takes a file, whether it is a live instrument — rather than one paragraph repeated
 * for every tool. Each step is a translation key plus its interpolation values, so the
 * component (not this module) owns the localized string and this stays a pure,
 * testable description of the flow.
 */
import type { Tool } from "../data/tools.ts";
import type { TranslationKey } from "../i18n/translations.ts";
import { getToolSchema } from "./toolSchemas.ts";
import { resolveInputMode } from "./toolInputMode.ts";
import { isLiveTool } from "./liveSlugs.ts";

export type GuideKind = "live" | "file" | "form" | "text" | "unavailable";

export type GuideStep = {
  key: TranslationKey;
  values?: Record<string, string | number>;
};

/** Slugs that expose a mode selector above the input; kept beside the guide so the
 *  "choose the mode" step and the workspace's own selector cannot disagree. */
export const MODE_TOOL_SLUGS: ReadonlySet<string> = new Set([
  "reverse-text",
  "sort-list",
  "base64-text",
  "url-encode-decode",
  "html-entities",
  "yaml-json-toml-xml-converter",
  "random-number-generator",
  "uuid-generator",
]);

/**
 * Which kind of page a tool is. Order matters: a live tool is live even though it also
 * has a schema, and a tool that accepts files is a file tool even if it also has form
 * fields (the file is the first thing a reader has to supply).
 *
 * The form-vs-text decision comes from the shared `resolveInputMode` predicate, so the
 * steps describe the controls the workbench actually renders. `file-hash` maps to the
 * guide's `file` kind; a `form` schema that also accepts a file keeps the file-first
 * steps (choose the file, then fill any named fields).
 */
export function guideKind(slug: string, implemented: boolean): GuideKind {
  if (!implemented) return "unavailable";
  if (isLiveTool(slug)) return "live";
  const schema = getToolSchema(slug);
  const mode = resolveInputMode(slug, schema);
  if (mode === "file-hash") return "file";
  if (mode === "form") return schema?.accept ? "file" : "form";
  return "text";
}

const step = (key: TranslationKey, values?: GuideStep["values"]): GuideStep => ({ key, values });
const say = (name: string): GuideStep => ({ key: `tool.guide.live.${name}` as TranslationKey });

/**
 * Live instruments have no shared flow — a stopwatch and a colour-pixel test share
 * nothing but the fact that they run in the tab. Each gets its own short sequence.
 */
const LIVE_STEPS: Record<string, GuideStep[]> = {
  "countdown-timer": [say("s.countdown"), say("start"), say("watch"), say("reset")],
  stopwatch: [say("s.stopwatch"), say("watch"), say("reset")],
  "world-clock": [say("s.clock"), say("read"), say("explore")],
  "timer-with-alarm": [say("s.alarm"), say("start"), say("stop")],
  "pomodoro-timer": [say("s.pomodoro"), say("start"), say("stop")],
  "typing-speed-test": [say("s.typing"), say("watch"), say("reset")],
  "reaction-time-test": [say("s.reaction"), say("watch"), say("reset")],
  "decision-wheel": [say("s.wheel"), say("spin"), say("read")],
  "list-wheel-picker": [say("s.wheel"), say("spin"), say("read")],
  "screen-ruler": [say("s.ruler"), say("read"), say("reset")],
  "fullscreen-dead-pixel-test": [say("s.pixel"), say("cycle"), say("escape")],
  whiteboard: [say("s.whiteboard"), say("adjust"), say("reset")],
  "keycode-info": [say("s.keycode"), say("read"), say("explore")],
  "benchmark-builder": [say("s.benchmark"), say("watch"), say("read")],
  "favicon-generator": [say("s.favicon"), step("tool.guide.step.copyDownload"), say("explore")],
  "html-wysiwyg-editor": [say("s.editor"), say("watch"), step("tool.guide.step.copy")],
  "camera-recorder": [say("allow"), say("s.recorder"), say("stop"), step("tool.guide.step.copyDownload")],
  "screen-audio-recorder": [say("allow"), say("s.recorder"), say("stop"), step("tool.guide.step.copyDownload")],
};

/** Join localized field labels into one readable list for the "fill in the fields" step. */
function fieldList(labels: string[]): string {
  return labels.join(", ");
}

/**
 * The ordered steps for a tool. Returns 3–5 steps for every implemented tool and an
 * empty array for one that is not built yet (the page shows the "not built" copy
 * instead, because inventing steps for a tool that does nothing would be a lie).
 */
export function toolGuideSteps(tool: Tool, language: "en" | "bn", kind: GuideKind): GuideStep[] {
  if (kind === "unavailable") return [];

  if (kind === "live") return (LIVE_STEPS[tool.slug] ?? [say("explore"), say("watch"), say("read")]).slice(0, 5);

  const schema = getToolSchema(tool.slug);
  const labels = (schema?.fields ?? []).map((field) => field.label[language] || field.label.en);

  if (kind === "file") {
    const steps: GuideStep[] = [step("tool.guide.step.file.choose")];
    if (labels.length > 0) steps.push(step("tool.guide.step.form.fields", { fields: fieldList(labels) }));
    steps.push(step("tool.guide.step.file.local"));
    // The hash tool hashes the moment a file is picked; everything else waits for Run.
    steps.push(step(tool.slug === "file-hash-calculator" ? "tool.guide.step.file.auto" : "tool.guide.step.file.run"));
    steps.push(step("tool.guide.step.copyDownload"));
    return steps.slice(0, 5);
  }

  if (kind === "form") {
    const steps: GuideStep[] = [step("tool.guide.step.form.fields", { fields: fieldList(labels) })];
    if (MODE_TOOL_SLUGS.has(tool.slug)) steps.push(step("tool.guide.step.form.mode"));
    steps.push(step("tool.guide.step.form.run"));
    if (schema?.example) steps.push(step("tool.guide.step.form.example"));
    steps.push(step("tool.guide.step.copyDownload"));
    return steps.slice(0, 5);
  }

  return [
    step("tool.guide.step.text.input"),
    step("tool.guide.step.text.result"),
    step("tool.guide.step.text.run"),
    step("tool.guide.step.copy"),
  ];
}
