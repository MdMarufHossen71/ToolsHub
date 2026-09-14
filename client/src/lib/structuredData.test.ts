import { describe, expect, it } from "vitest";
import { toolRegistry } from "@/data/tools";
import { gameRegistry } from "@/data/games";
import { SITE_URL, canonicalUrl } from "./seo";
import { buildJsonLdGraph, gameNodes, toolNodes, websiteNode } from "./structuredData";

const labels = { home: "Home", section: "Tools" };

/** Everything must survive the round trip through a real `<script>` payload. */
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("websiteNode", () => {
  it("is a WebSite with a SearchAction pointing at the app search route", () => {
    const node = asJson(websiteNode({ description: "Browser tools.", locale: "en" }));
    expect(node["@type"]).toBe("WebSite");
    expect(node.url).toBe(`${SITE_URL}/`);
    expect(node.potentialAction["@type"]).toBe("SearchAction");
    expect(node.potentialAction.target.urlTemplate).toContain("{search_term_string}");
    expect(node.potentialAction["query-input"]).toBe("required name=search_term_string");
  });
});

describe("toolNodes", () => {
  const tool = toolRegistry.find((entry) => entry.slug === "reverse-text")!;

  it("is a WebApplication plus a BreadcrumbList", () => {
    const nodes = asJson(toolNodes(tool, "en", labels));
    expect(nodes).toHaveLength(2);
    expect(nodes[0]["@type"]).toBe("WebApplication");
    expect(nodes[0].url).toBe(canonicalUrl("/tools/reverse-text/"));
    expect(nodes[0].name).toBe("Reverse Text");
    expect(nodes[1]["@type"]).toBe("BreadcrumbList");
    expect(nodes[1].itemListElement).toHaveLength(3);
    expect(nodes[1].itemListElement[2].item).toBe(canonicalUrl("/tools/reverse-text/"));
  });

  it("uses the locale's description", () => {
    const en = asJson(toolNodes(tool, "en", labels))[0].description;
    const bn = asJson(toolNodes(tool, "bn", labels))[0].description;
    expect(en).toBe(tool.description.en);
    expect(bn).toBe(tool.description.bn);
    expect(bn).not.toBe(en);
  });
});

describe("gameNodes", () => {
  const game = gameRegistry.find((entry) => entry.slug === "snake")!;

  it("is a VideoGame plus a BreadcrumbList", () => {
    const nodes = asJson(gameNodes(game, "en", { home: "Home", section: "Games" }));
    expect(nodes[0]["@type"]).toBe("VideoGame");
    expect(nodes[0].url).toBe(canonicalUrl("/games/snake/"));
    expect(nodes[0].genre).toBe(game.genre);
    expect(nodes[1]["@type"]).toBe("BreadcrumbList");
  });
});

describe("buildJsonLdGraph", () => {
  it("wraps nodes in a valid JSON-LD graph", () => {
    const graph = asJson(buildJsonLdGraph([{ "@type": "Thing", name: "x" }]));
    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@graph"]).toHaveLength(1);
  });

  it("produces valid JSON for every tool and game in the registries", () => {
    for (const tool of toolRegistry) {
      const json = JSON.stringify(buildJsonLdGraph(toolNodes(tool, "en", labels)));
      expect(JSON.parse(json)["@graph"][0].url).toBe(canonicalUrl(`/tools/${tool.slug}/`));
    }
    for (const game of gameRegistry) {
      const json = JSON.stringify(buildJsonLdGraph(gameNodes(game, "bn", { home: "হোম", section: "গেমস" })));
      expect(JSON.parse(json)["@graph"][0].url).toBe(canonicalUrl(`/games/${game.slug}/`));
    }
  });
});
