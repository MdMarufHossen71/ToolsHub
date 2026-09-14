/**
 * The group-to-icon map on its own, with no dependency on the tool registry.
 *
 * The search suggestion rows need an icon, and `SiteShell` (which is in the first-paint
 * chunk) renders those rows. Importing `data/tools` for `getToolIcon` would pull the
 * whole 283-tool bilingual description table into every route's initial payload, so the
 * map lives here instead and `data/tools` re-exports it for the lazy pages.
 */
import { Braces, Calculator, ChartNoAxesCombined, Clock3, FileArchive, Image, Palette, RefreshCw, ShieldCheck, Sparkles, TextCursorInput, WandSparkles } from "lucide-react";
import type { ToolGroup } from "./tools.ts";

const iconMap = {
  text: TextCursorInput, crypto: ShieldCheck, data: Braces, image: Image, color: Palette,
  math: Calculator, time: Clock3, random: Sparkles, file: FileArchive, seo: ChartNoAxesCombined,
  misc: WandSparkles, ai: Sparkles,
};

export const getToolIcon = (group: ToolGroup) => iconMap[group] ?? RefreshCw;
