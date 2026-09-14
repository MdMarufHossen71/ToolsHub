import { describe, expect, it } from "vitest";
import { SITE_URL, buildPageMetaTags } from "./seo";
import { buildJsonLdGraph } from "./structuredData";
import { escapeHtml, escapeJsonForScript, renderShellHtml, type ShellInput } from "./seoShell";

const base: ShellInput = {
  title: "Reverse Text · ToolsHub",
  description: "Reverse a string by character, by word or by line.",
  metaTags: buildPageMetaTags({ title: "Reverse Text · ToolsHub", description: "Reverse a string.", locale: "en", canonical: `${SITE_URL}/tools/reverse-text/` }),
  jsonLd: buildJsonLdGraph([{ "@type": "WebApplication", name: "Reverse Text" }]),
  h1: "Reverse Text",
  intro: ["Reverse a string."],
  sections: [
    { heading: "About this tool", paragraphs: ["A browser-only tool."] },
    { heading: "How to use", steps: ["Paste your text.", "Read the result."] },
  ],
  redirectTo: "/#/tools/reverse-text",
  stylesheetHref: "/assets/index-abc123.css",
  openLabel: "Open in ToolsHub",
  noscriptNote: "JavaScript is off.",
};

const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;

describe("renderShellHtml", () => {
  const html = renderShellHtml(base);

  it("has a lang, a title, a description and a canonical", () => {
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>Reverse Text · ToolsHub</title>");
    expect(html).toContain('<meta name="description" content="Reverse a string."');
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/tools/reverse-text/"`);
  });

  it("has exactly one h1 and does not skip heading levels", () => {
    expect(count(html, /<h1\b/g)).toBe(1);
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
    for (let i = 1; i < levels.length; i += 1) expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1);
  });

  it("embeds parseable JSON-LD and a hand-over script", () => {
    const payload = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
    expect(JSON.parse(payload)["@graph"][0]["@type"]).toBe("WebApplication");
    expect(html).toContain('<script>location.replace("/#/tools/reverse-text");</script>');
  });

  it("renders the shell lang and hreflang alternates", () => {
    const bn = renderShellHtml({
      ...base,
      lang: "bn",
      metaTags: buildPageMetaTags({
        title: "x",
        description: "y",
        locale: "bn",
        canonical: `${SITE_URL}/bn/tools/x/`,
        alternates: { en: `${SITE_URL}/tools/x/`, bn: `${SITE_URL}/bn/tools/x/` },
      }),
    });
    expect(bn).toContain('<html lang="bn">');
    expect(bn).toContain(`<link rel="alternate" hreflang="en" href="${SITE_URL}/tools/x/" />`);
    expect(bn).toContain(`<link rel="alternate" hreflang="bn" href="${SITE_URL}/bn/tools/x/" />`);
    expect(bn).toContain(`<link rel="alternate" hreflang="x-default" href="${SITE_URL}/tools/x/" />`);
  });

  it("links the stylesheet with an absolute path and keeps a noscript fallback", () => {
    expect(html).toContain('<link rel="stylesheet" href="/assets/index-abc123.css" />');
    expect(html).toContain("<noscript>");
  });
});

describe("escaping", () => {
  it("escapes HTML text", () => {
    expect(escapeHtml('Find & Replace <x> "y"')).toBe("Find &amp; Replace &lt;x&gt; &quot;y&quot;");
  });

  it("cannot close a script element early", () => {
    const escaped = escapeJsonForScript({ name: "</script><img>" });
    expect(escaped).not.toContain("</script>");
    expect(JSON.parse(escaped.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">"))).toEqual({ name: "</script><img>" });
  });
});
