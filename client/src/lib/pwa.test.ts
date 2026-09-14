import { describe, expect, it } from "vitest";
import { isStandalone, resolveServiceWorkerScope, resolveServiceWorkerUrl } from "@/lib/pwa";

describe("pwa service-worker URL resolution", () => {
  it("puts the worker at the domain root when the app is served from one", () => {
    expect(resolveServiceWorkerUrl("./", "https://example.com/index.html")).toBe("https://example.com/sw.js");
    expect(resolveServiceWorkerScope("./", "https://example.com/index.html")).toBe("/");
  });

  it("keeps a subpath deployment under its own base", () => {
    expect(resolveServiceWorkerUrl("./", "https://example.com/tools/index.html")).toBe("https://example.com/tools/sw.js");
    expect(resolveServiceWorkerScope("./", "https://example.com/tools/index.html")).toBe("/tools/");
  });

  it("ignores the hash route when deriving the scope", () => {
    expect(resolveServiceWorkerScope("./", "https://example.com/tools/#/tools/json")).toBe("/tools/");
  });
});

describe("pwa standalone detection", () => {
  it("treats display-mode standalone or the iOS flag as installed", () => {
    expect(isStandalone(true, undefined)).toBe(true);
    expect(isStandalone(false, true)).toBe(true);
    expect(isStandalone(false, false)).toBe(false);
    expect(isStandalone(false, undefined)).toBe(false);
  });
});
