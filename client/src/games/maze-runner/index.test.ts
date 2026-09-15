import { describe, expect, it } from "vitest";
import { generateMaze, solveMaze } from "./index";

describe("maze-runner", () => {
  it("solves every generated maze from start to goal", () => {
    for (let i = 0; i < 10; i += 1) {
      const walls = generateMaze();
      const path = solveMaze(walls);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[path.length - 1]).toEqual({ x: 14, y: 14 });
      for (let s = 1; s < path.length; s += 1) {
        const a = path[s];
        const b = path[s - 1];
        // A solver gap would be a maze bug, not a test artifact: fail loudly.
        if (!a || !b) throw new Error("path gap");
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        expect(dx + dy).toBe(1);
      }
    }
  });
});
