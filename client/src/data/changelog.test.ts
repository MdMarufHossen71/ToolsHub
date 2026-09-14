import { describe, expect, it } from "vitest";
import { changelog } from "./changelog";
import { SITE_LAST_UPDATED, formatSiteDate } from "../lib/siteUpdated";

describe("changelog data", () => {
  it("is newest first and every date is a valid ISO calendar day", () => {
    const dates = changelog.map((entry) => entry.date);
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(`${date}T00:00:00Z`))).toBe(false);
    }
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  it("gives every entry a title and at least one item in both languages", () => {
    for (const entry of changelog) {
      expect(entry.title.en.trim().length).toBeGreaterThan(0);
      expect(entry.title.bn.trim().length).toBeGreaterThan(0);
      expect(entry.items.length).toBeGreaterThan(0);
      for (const item of entry.items) {
        expect(item.en.trim().length).toBeGreaterThan(0);
        expect(item.bn.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the footer's last-updated date equal to the newest entry", () => {
    expect(SITE_LAST_UPDATED).toBe(changelog[0].date);
  });
});

describe("formatSiteDate", () => {
  it("renders an English date for the en locale", () => {
    expect(formatSiteDate("2026-09-12", "en")).toBe("12 September 2026");
  });

  it("renders a Bangla date with Bangla month name and digits", () => {
    const formatted = formatSiteDate("2026-09-12", "bn");
    expect(formatted).not.toBe("12 September 2026");
    // Bangla digits are U+09E6..U+09EF; the rendered year must use them.
    expect(/[\u09E6-\u09EF]/.test(formatted)).toBe(true);
  });
});
