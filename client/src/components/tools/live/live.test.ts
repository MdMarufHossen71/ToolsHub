import { describe, expect, it } from "vitest";
import { spinIndex } from "./WheelTool";
import { formatClock } from "./useLive";
import { getLiveTool, liveToolSlugs } from "./index";
import { LIVE_TOOL_SLUGS } from "@/lib/liveSlugs";

describe("live helpers", () => {
  it("spins fairly inside the option range", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      const index = spinIndex(5);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(5);
      seen.add(index);
    }
    expect(seen.size).toBe(5);
  });

  it("formats clock times", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(3661)).toBe("01:01:01");
    expect(formatClock(-5)).toBe("00:00");
  });

  it("keeps the live registry and the shared slug list identical", () => {
    expect([...LIVE_TOOL_SLUGS].sort()).toEqual([...liveToolSlugs].sort());
    for (const slug of LIVE_TOOL_SLUGS) expect(getLiveTool(slug), slug).not.toBeNull();
  });
});
