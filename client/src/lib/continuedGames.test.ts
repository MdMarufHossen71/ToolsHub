// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { gameStateKey } from "./storage";
import { getContinuedGames } from "./continuedGames";

const save = (highScore: number, score: number, updatedAt: string) =>
  JSON.stringify({ version: 2, highScore, score, level: 1, resources: 0, updatedAt });

describe("continuedGames", () => {
  it("lists played games newest-first and skips the rest", () => {
    localStorage.clear();
    localStorage.setItem(gameStateKey("snake"), save(10, 4, "2026-01-02T00:00:00.000Z"));
    localStorage.setItem(gameStateKey("tetris"), save(30, 30, "2026-03-01T00:00:00.000Z"));
    localStorage.setItem(gameStateKey("2048"), save(0, 0, "2026-04-01T00:00:00.000Z"));
    localStorage.setItem(gameStateKey("sudoku"), "not-json{{{");
    const continued = getContinuedGames();
    expect(continued.map((entry) => entry.game.slug)).toEqual(["tetris", "snake"]);
    expect(continued[0]?.save.highScore).toBe(30);
  });

  it("is empty with no saves", () => {
    localStorage.clear();
    expect(getContinuedGames()).toEqual([]);
  });
});
