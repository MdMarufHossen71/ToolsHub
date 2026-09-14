import { describe, expect, it } from "vitest";
import { OG_IMAGE_URL, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, SITE_URL, SECTION_ROUTES, buildPageMetaTags, canonicalUrl, localizedPath, localizedUrl, ogLocale, parseRoute } from "./seo";

describe("parseRoute", () => {
  it("maps the home route to a root clean path", () => {
    expect(parseRoute("/")).toEqual({ kind: "home", slug: null, path: "/" });
  });

  it("maps tool and game routes to trailing-slash clean paths", () => {
    expect(parseRoute("/tools/reverse-text")).toEqual({ kind: "tool", slug: "reverse-text", path: "/tools/reverse-text/" });
    expect(parseRoute("/games/snake")).toEqual({ kind: "game", slug: "snake", path: "/games/snake/" });
    expect(parseRoute("/tools")).toEqual({ kind: "tools", slug: null, path: "/tools/" });
    expect(parseRoute("/games")).toEqual({ kind: "games", slug: null, path: "/games/" });
  });

  it("classifies every section route", () => {
    for (const [location, kind] of [["/links", "links"], ["/ai", "ai"], ["/about", "about"], ["/how-to", "how-to"], ["/privacy", "privacy"], ["/settings", "settings"], ["/changelog", "changelog"]] as const) {
      expect(parseRoute(location).kind).toBe(kind);
    }
  });

  it("treats an unknown route as `other` and canonicalises it to the root", () => {
    expect(parseRoute("/nope/123")).toEqual({ kind: "other", slug: null, path: "/" });
  });

  it("ignores a query string", () => {
    expect(parseRoute("/tools/reverse-text?search=1").path).toBe("/tools/reverse-text/");
  });
});

describe("canonicalUrl", () => {
  it("builds an absolute URL against the production origin", () => {
    expect(canonicalUrl("/tools/reverse-text/")).toBe(`${SITE_URL}/tools/reverse-text/`);
    expect(canonicalUrl("/")).toBe(`${SITE_URL}/`);
  });
});

describe("buildPageMetaTags", () => {
  const tags = buildPageMetaTags({ title: "Reverse Text · ToolsHub", description: "Reverse a string.", locale: "en", canonical: `${SITE_URL}/tools/reverse-text/` });
  const find = (key: string) => tags.find((tag) => tag.kind === "meta" && tag.key === key);

  it("sets description, Open Graph and Twitter tags", () => {
    expect(find("description")).toMatchObject({ attr: "name", content: "Reverse a string." });
    expect(find("og:title")).toMatchObject({ content: "Reverse Text · ToolsHub" });
    expect(find("og:type")).toMatchObject({ content: "website" });
    expect(find("og:site_name")).toMatchObject({ content: "ToolsHub" });
    expect(find("og:image")).toMatchObject({ content: OG_IMAGE_URL });
    expect(find("og:image:width")).toMatchObject({ content: String(OG_IMAGE_WIDTH) });
    expect(find("og:image:height")).toMatchObject({ content: String(OG_IMAGE_HEIGHT) });
    expect(find("twitter:card")).toMatchObject({ content: "summary_large_image" });
    expect(find("twitter:image")).toMatchObject({ content: OG_IMAGE_URL });
  });

  it("points og:url and the canonical link at the clean path", () => {
    expect(find("og:url")).toMatchObject({ content: `${SITE_URL}/tools/reverse-text/` });
    expect(tags.find((tag) => tag.kind === "link" && tag.rel === "canonical")).toMatchObject({ href: `${SITE_URL}/tools/reverse-text/` });
  });

  it("has no og:url or canonical when there is no clean path", () => {
    const bare = buildPageMetaTags({ title: "x", description: "y", locale: "en", canonical: null });
    expect(bare.some((tag) => tag.kind === "meta" && tag.key === "og:url")).toBe(false);
    expect(bare.some((tag) => tag.kind === "link")).toBe(false);
  });

  it("maps the locale", () => {
    expect(ogLocale("bn")).toBe("bn_BD");
    expect(ogLocale("en")).toBe("en_US");
  });

  it("emits hreflang alternates plus x-default when both locales exist", () => {
    const withAlts = buildPageMetaTags({
      title: "x",
      description: "y",
      locale: "bn",
      canonical: `${SITE_URL}/bn/tools/x/`,
      alternates: { en: `${SITE_URL}/tools/x/`, bn: `${SITE_URL}/bn/tools/x/` },
    });
    const links = withAlts.filter((tag) => tag.kind === "link" && tag.rel === "alternate");
    expect(links).toMatchObject([
      { href: `${SITE_URL}/tools/x/`, hreflang: "en" },
      { href: `${SITE_URL}/bn/tools/x/`, hreflang: "bn" },
      { href: `${SITE_URL}/tools/x/`, hreflang: "x-default" },
    ]);
  });

  it("emits no alternates when none are passed", () => {
    const bare = buildPageMetaTags({ title: "x", description: "y", locale: "en", canonical: `${SITE_URL}/` });
    expect(bare.some((tag) => tag.kind === "link" && tag.rel === "alternate")).toBe(false);
  });
});

describe("localized paths", () => {
  it("keeps English at the clean path and nests Bangla under /bn", () => {
    expect(localizedPath("/tools/x/", "en")).toBe("/tools/x/");
    expect(localizedPath("/tools/x/", "bn")).toBe("/bn/tools/x/");
    expect(localizedUrl("/tools/x/", "bn")).toBe(`${SITE_URL}/bn/tools/x/`);
  });
});

describe("SECTION_ROUTES", () => {
  it("has no duplicate paths and all are trailing-slash", () => {
    const paths = SECTION_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const routePath of paths) expect(routePath.endsWith("/")).toBe(true);
  });
});
