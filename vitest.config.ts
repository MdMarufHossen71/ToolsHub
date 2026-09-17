import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    // `.tsx` holds the jsdom component tests (each opts into jsdom per-file so
    // the pure-logic suite keeps the fast node environment).
    include: ["client/src/**/*.test.{ts,tsx}"],
    setupFiles: ["client/src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["client/src/**/*.{ts,tsx}"],
      exclude: [
        "client/src/**/*.test.{ts,tsx}",
        "client/src/test-setup.ts",
        "client/src/games/**/index.tsx",
      ],
      // Measured 2026-09: 50 lines / 48 branches / 37 funcs. Lib is strong;
      // pages + untested component shells sit at 0 by design and are covered by
      // device smoke + (later) Playwright — they drag the globals down, so these
      // thresholds guard the tested surface against regression rather than
      // describing a goal. Raise them as Playwright coverage lands.
      thresholds: { lines: 50, branches: 47, functions: 36 },
    },
  },
});
