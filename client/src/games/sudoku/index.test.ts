import { describe, expect, it } from "vitest";
import { conflicts, digHoles, isComplete, solvedGrid } from "./index";

describe("sudoku generator", () => {
  it("produces a valid complete grid", () => {
    const grid = solvedGrid();
    expect(grid).toHaveLength(81);
    expect(isComplete(grid)).toBe(true);
  });

  it("digs to 36 givens that stay solvable by completion", () => {
    const givens = digHoles(solvedGrid());
    expect(givens.filter((g) => g !== 0)).toHaveLength(36);
  });

  it("flags duplicates and only duplicates", () => {
    const grid = solvedGrid();
    const broken = grid.slice();
    const first = broken[0];
    if (first === undefined) throw new Error("bad-init");
    broken[1] = first;
    expect(conflicts(broken, 1).length).toBeGreaterThan(0);
    expect(conflicts(grid, 10)).toEqual([]);
    const empty = Array(81).fill(0);
    expect(isComplete(empty)).toBe(false);
  });
});
