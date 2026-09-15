/**
 * Flat ESLint config: JS recommended + TypeScript recommended (not the
 * type-checked sets — slower and noisier; escalate later) + react-hooks +
 * react-compiler (guards the Step 5 compiler rollout at lint time).
 *
 * No formatting rules: Prettier owns formatting (`pnpm format`), so the two
 * tools can never contradict each other.
 *
 * Run with:  corepack pnpm run lint
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactCompiler from "eslint-plugin-react-compiler";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "node_modules/**", ".manus-logs/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs["recommended-latest"],
  reactCompiler.configs.recommended,
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // The service worker runs off-DOM: caches/fetch/Request live there, not `window`.
    files: ["client/public/sw.js"],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
  {
    files: ["scripts/**/*.mjs", "server/**/*.ts", "vite.config.ts", "vitest.config.ts", "eslint.config.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
