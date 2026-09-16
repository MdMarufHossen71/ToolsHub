/**
 * Friendly body for a tool result panel.
 *
 * The workspace used to print every answer as a mono code block — including
 * single numbers like a BMI or a countdown. `ResultView` keeps that exact text
 * as the copy/download source of truth, but shows it the way people read:
 * labeled cards for flat objects, a clean list for arrays, the real table when
 * the runner built one, and the untouched block for everything else.
 */
import { ImageDown } from "lucide-react";
import type { ToolResult } from "@/lib/toolOperations";
import { parseFriendlyJson, type FriendlyData } from "@/lib/resultView";
import { useTranslation } from "@/contexts/AppSettingsContext";

export function ResultView({
  output,
  empty,
  emptyText,
}: {
  output: ToolResult;
  /** Untouched prompt: show the friendly empty state instead of a blank box. */
  empty: boolean;
  emptyText: string;
}) {
  const { t } = useTranslation();

  if (empty) {
    return (
      <div className="result-empty" role="status">
        <span className="result-empty-icon" aria-hidden="true">✦</span>
        <p>{emptyText}</p>
      </div>
    );
  }

  const friendly: FriendlyData | null = output.error ? null : parseFriendlyJson(output.text, t("common.yes"), t("common.no"));

  return (
    <div className="result-body">
      {output.error ? (
        <p className="tool-output tool-output-error" role="alert">
          {output.text}
        </p>
      ) : friendly?.kind === "cards" ? (
        <>
          <dl className="result-cards">
            {friendly.cards.map((card) => (
              <div key={card.label} className="result-card">
                <dt>{card.label}</dt>
                <dd>{card.value}</dd>
              </div>
            ))}
          </dl>
          <details className="result-raw"><summary>{t("result.showRaw")}</summary><pre className="tool-output">{output.text}</pre></details>
        </>
      ) : friendly?.kind === "list" ? (
        <>
          <ul className="result-list">
            {friendly.items.map((item, index) => (
              // Position is the identity here (generated lines); no stable key exists.
              <li key={index}>{item}</li>
            ))}
          </ul>
          <details className="result-raw"><summary>{t("result.showRaw")}</summary><pre className="tool-output">{output.text}</pre></details>
        </>
      ) : output.html ? (
        <div className="tool-html-preview" dangerouslySetInnerHTML={{ __html: output.html }} />
      ) : (
        // `role="status"` so a recomputed result is announced, not just repainted.
        <pre className="tool-output" role="status" aria-live="polite">
          {output.text}
        </pre>
      )}
      {output.image && (
        <figure className="tool-image-figure">
          <img src={output.image} alt="" className="tool-image-preview" />
          <figcaption>
            {output.label ?? t("tool.output")}{" "}
            <a className="result-image-download" href={output.image} download="result.png">
              <ImageDown className="size-3.5" aria-hidden="true" />
              {t("result.downloadImage")}
            </a>
          </figcaption>
        </figure>
      )}
      {output.table && output.table.rows.length > 0 && (
        <div className="tool-table-wrap">
          <table className="tool-table">
            <caption className="sr-only">{output.label ?? t("tool.output")}</caption>
            <thead>
              <tr>
                {output.table.head.map((cell, j) => (
                  <th key={`${j}-${cell}`} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {output.table.rows.map((row, i) => (
                // Row order is the data (generated results); no stable key exists.
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={`${i}-${j}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

