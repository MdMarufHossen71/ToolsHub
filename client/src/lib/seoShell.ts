/**
 * Prerendered-shell HTML renderer.
 *
 * A shell is a complete static page for one clean path (`/tools/reverse-text/`).
 * It carries the real title, description, canonical/OG/Twitter tags, JSON-LD and the
 * tool's own "About"/"How to use" copy as plain HTML, so a crawler that does not run
 * JavaScript still reads the page. A tiny inline script then hands the human over to
 * the working hash route.
 *
 * This module is deliberately dependency-free (no React, no alias imports) so both
 * the app's tests and `scripts/generate-seo.mjs` can use it, and so the structure it
 * emits can be asserted by `scripts/shell-audit.mjs`.
 */
import type { JsonLdNode } from "./structuredData.ts";
import type { MetaTag } from "./seo.ts";

export type ShellSection = {
  heading: string;
  paragraphs?: string[];
  steps?: string[];
};

export type ShellInput = {
  /** Document title, brand suffix included. */
  title: string;
  description: string;
  metaTags: MetaTag[];
  jsonLd: JsonLdNode | null;
  h1: string;
  intro: string[];
  sections: ShellSection[];
  /** In-app hash URL, e.g. `/#/tools/reverse-text`. */
  redirectTo: string;
  /** Absolute stylesheet URL (`/assets/index-xxxx.css`) or null. */
  stylesheetHref?: string | null;
  /** Visible link label, e.g. "Open Reverse Text in ToolsHub". */
  openLabel: string;
  /** Extra line shown when scripting is unavailable. */
  noscriptNote: string;
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

/** JSON embedded in a `<script>` must not be able to close the element early. */
export function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function metaTagHtml(tag: MetaTag): string {
  if (tag.kind === "link") return `<link rel="${escapeHtml(tag.rel)}" href="${escapeHtml(tag.href)}" />`;
  return `<meta ${tag.attr}="${escapeHtml(tag.key)}" content="${escapeHtml(tag.content)}" />`;
}

/** Renders one complete static shell document. */
export function renderShellHtml(input: ShellInput): string {
  const tags = input.metaTags.map((tag) => `    ${metaTagHtml(tag)}`).join("\n");
  const stylesheet = input.stylesheetHref ? `    <link rel="stylesheet" href="${escapeHtml(input.stylesheetHref)}" />\n` : "";
  const jsonLd = input.jsonLd ? `    <script type="application/ld+json">${escapeJsonForScript(input.jsonLd)}</script>\n` : "";

  const intro = input.intro
    .map((paragraph) => `      <p>${escapeHtml(paragraph)}</p>`)
    .join("\n");

  const sections = input.sections
    .map((section) => {
      const paragraphs = (section.paragraphs ?? []).map((paragraph) => `        <p>${escapeHtml(paragraph)}</p>`).join("\n");
      const steps = section.steps?.length
        ? `        <ol>\n${section.steps.map((step) => `          <li>${escapeHtml(step)}</li>`).join("\n")}\n        </ol>`
        : "";
      const body = [paragraphs, steps].filter(Boolean).join("\n");
      return `      <section>\n        <h2>${escapeHtml(section.heading)}</h2>\n${body}\n      </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.title)}</title>
    <!-- Indexable static copy of a route that the hash-routed app also renders. -->
    <meta name="robots" content="index,follow" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f7f6f1" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a1025" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
${tags}
${stylesheet}${jsonLd}    <script>location.replace(${JSON.stringify(input.redirectTo)});</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(input.h1)}</h1>
${intro}
${sections}
      <p><a href="${escapeHtml(input.redirectTo)}">${escapeHtml(input.openLabel)}</a></p>
      <noscript>
        <p>${escapeHtml(input.noscriptNote)}</p>
      </noscript>
    </main>
  </body>
</html>
`;
}
