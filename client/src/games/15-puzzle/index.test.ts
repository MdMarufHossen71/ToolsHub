import { describe, expect, it } from "vitest";
import { inversionCount, isSolved, neighbours, solvableShuffle, solvedTiles } from "./index";

describe("15-puzzle logic", () => {
  it("recognises the solved board", () => {
    expect(isSolved(solvedTiles())).toBe(true);
    const bad = solvedTiles();
    const first = bad[0];
    const second = bad[1];
    if (first === undefined || second === undefined) throw new Error("bad-init");
    bad[0] = second;
    bad[1] = first;
    expect(isSolved(bad)).toBe(false);
  });

  it("deals a valid, unsolved, solvable permutation", () => {
    for (let i = 0; i < 20; i += 1) {
      const tiles = solvableShuffle();
      expect([...tiles].sort((a, b) => a - b)).toEqual(solvedTiles().slice().sort((a, b) => a - b));
      expect(isSolved(tiles)).toBe(false);
      const blankRowFromBottom = 4 - Math.floor(tiles.indexOf(0) / 4);
      expect((inversionCount(tiles) + blankRowFromBottom) % 2).toBe(1);
    }
  });

  it("lists orthogonal neighbours only", () => {
    expect(neighbours(0).sort()).toEqual([1, 4]);
    expect(neighbours(5).sort()).toEqual([1, 4, 6, 9]);
    expect(neighbours(15).sort()).toEqual([11, 14]);
  });
});
