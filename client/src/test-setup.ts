import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// RTL auto-cleanup needs explicit wiring because vitest `globals` stays off
// (the pure-logic suite must not see DOM globals).
afterEach(() => cleanup());
