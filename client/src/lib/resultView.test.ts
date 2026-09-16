import { describe, expect, it } from "vitest";
import {
  cardsToText,
  copyTextForOutput,
  downloadForOutput,
  humanizeKey,
  parseFriendlyJson,
  tableToCsv,
} from "./resultView";

describe("resultView helpers", () => {
  it("humanizes runner keys", () => {
    expect(humanizeKey("charactersNoSpace")).toBe("Characters No Space");
    expect(humanizeKey("aa_large")).toBe("Aa large");
    expect(humanizeKey("ratio")).toBe("Ratio");
  });

  it("turns flat objects into cards, including one nested level", () => {
    const cards = parseFriendlyJson(JSON.stringify({ words: 5, characters: 29, topWords: { paste: 1, or: 1 } }));
    expect(cards?.kind).toBe("cards");
    if (cards?.kind !== "cards") return;
    expect(cards.cards[0]).toEqual({ label: "Words", value: "5" });
    expect(cards.cards[2]).toEqual({ label: "Top Words", value: "paste ×1, or ×1" });
  });

  it("marks booleans with text, never bare colour", () => {
    const cards = parseFriendlyJson(JSON.stringify({ aaNormal: true, aaaNormal: false }), "Yes", "No");
    if (cards?.kind !== "cards") throw new Error("expected cards");
    expect(cards.cards[0]?.value).toBe("✓ Yes");
    expect(cards.cards[1]?.value).toBe("✕ No");
  });

  it("turns scalar arrays into lists and rejects nested shapes", () => {
    expect(parseFriendlyJson(JSON.stringify(["a", "b"]))?.kind).toBe("list");
    expect(parseFriendlyJson(JSON.stringify({ a: { b: { c: 1 } } }))).toBeNull();
    expect(parseFriendlyJson("just text")).toBeNull();
    expect(parseFriendlyJson("")).toBeNull();
  });

  it("copies tables as CSV and downloads the right file kind", () => {
    const table = { head: ["A", "B"], rows: [["x,y", 'q"q'], ["1", "2"]] };
    expect(tableToCsv(table)).toBe('A,B\n"x,y","q""q"\n1,2');
    expect(copyTextForOutput({ text: "unused", table })).toBe('A,B\n"x,y","q""q"\n1,2');
    expect(cardsToText([{ label: "Words", value: "5" }])).toBe("Words: 5");
    expect(downloadForOutput({ text: "unused", table }, "csv-sorter").filename).toBe("csv-sorter-result.csv");
    expect(downloadForOutput({ text: '{"a":1}' }, "word-counter").filename).toBe("word-counter-result.json");
    expect(downloadForOutput({ text: "hello" }, "slug-generator").filename).toBe("slug-generator-result.txt");
  });
});
