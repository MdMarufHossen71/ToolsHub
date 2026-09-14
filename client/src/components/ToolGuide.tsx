/** Cobalt Workshop design reminder: the prose below the bench explains a real instrument—never filler—and stays in the page for readers and search engines alike. */
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { Tool } from "@/data/tools";
import { isToolImplemented } from "@/lib/toolOperations";
import { guideKind, toolGuideSteps } from "@/lib/toolGuide";

/**
 * The always-in-DOM "About" and "How to use" sections under a tool bench.
 *
 * These are plain rendered text, not tabs or accordions, because a first-time visitor
 * and a search-engine crawler both need them without a click. The steps come from
 * `toolGuideSteps`, which reads the tool's real schema fields and kind, so this is the
 * tool's own flow rather than one paragraph copied onto 287 pages.
 */
export function ToolGuide({ tool }: { tool: Tool }) {
  const { t, language } = useTranslation();
  const kind = guideKind(tool.slug, isToolImplemented(tool.slug));
  const description = tool.description[language] || tool.description.en;
  const steps = toolGuideSteps(tool, language, kind);

  return (
    <section className="tool-content" aria-labelledby="tool-about-title">
      <div className="tool-content-panel">
        <h2 id="tool-about-title">{t("tool.guide.aboutTitle")}</h2>
        <p>{description}</p>
        <p>{t(`tool.guide.about.${kind}`)}</p>
        <p>{t("tool.guide.notDo")} {t("tool.guide.privacy")}</p>
      </div>
      <div className="tool-content-panel">
        <h2 id="tool-how-title">{t("tool.guide.howTitle")}</h2>
        {steps.length > 0 ? (
          <ol className="tool-steps">
            {steps.map((item, index) => (
              // Index in the key: two steps can legitimately share a key (e.g. two
              // "copy" style steps) and the order is what makes them distinct.
              <li key={`${item.key}-${index}`}>{t(item.key, item.values)}</li>
            ))}
          </ol>
        ) : (
          // An unbuilt tool has no honest steps to give, so it points at the reason.
          <p>{t("tool.unavailable.copy")}</p>
        )}
      </div>
    </section>
  );
}
