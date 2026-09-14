/**
 * The one decision of which input UI a tool gets, shared by the workbench and the
 * "How to use" guide so the rendered controls and the written steps cannot drift
 * apart again.
 *
 * Three modes:
 * - `file-hash` — the hash calculator's bespoke file picker (its own flow, no schema).
 * - `form`      — a schema with named fields and/or a file `accept`; renders the named
 *                 `FieldInput`s plus the `accept` picker.
 * - `text`      — the classic single textarea.
 *
 * A schema with only `accept` (no fields) is a form: it still needs the file picker,
 * which lives in the form branch. That was the case the old fields-only test missed.
 */
import { getToolSchema, type ToolSchema } from "./toolSchemas.ts";

export type InputMode = "file-hash" | "form" | "text";

/** The hash calculator owns a dedicated picker instead of the schema form. */
export const FILE_HASH_SLUG = "file-hash-calculator";

/** Which input UI a tool renders: a fields-or-accept schema is a form, nothing is text. */
export function resolveInputMode(slug: string, schema: ToolSchema | null = getToolSchema(slug)): InputMode {
  if (slug === FILE_HASH_SLUG) return "file-hash";
  if (schema && (schema.fields.length > 0 || Boolean(schema.accept))) return "form";
  return "text";
}
