import { describe, expect, it } from "vitest";
import { carveMaze, walkable } from "./index";

describe("maze-chaser maze", () => {
  it("keeps every odd cell open and the border shut", () => {
    for (let i = 0; i < 10; i += 1) {
      const open = carveMaze();
      for (let y = 1; y < 12; y += 2) {
        for (let x = 1; x < 18; x += 2) {
          expect(open[y]?.[x]).toBe(true);
        }
      }
      for (let x = 0; x < 19; x += 1) {
        expect(open[0]?.[x]).toBe(false);
        expect(open[12]?.[x]).toBe(false);
      }
      expect(walkable(open, 1, 1)).toBe(true);
      expect(walkable(open, -1, 0)).toBe(false);
      expect(walkable(open, 19, 0)).toBe(false);
    }
  });
});
