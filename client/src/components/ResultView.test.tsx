// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { AppSettingsProvider } from "@/contexts/AppSettingsContext";
import type { ToolResult } from "@/lib/toolOperations";
import { ResultView } from "./ResultView";

function renderView(output: ToolResult, empty = false, emptyText = "Add an input.") {
  return render(
    <AppSettingsProvider>
      <ResultView output={output} empty={empty} emptyText={emptyText} />
    </AppSettingsProvider>,
  );
}

describe("ResultView", () => {
  it("shows a friendly empty state for an untouched prompt", () => {
    renderView({ text: "Add an input." }, true, "Add an input.");
    expect(screen.getByRole("status")).toHaveTextContent("Add an input.");
  });

  it("renders flat JSON as labeled cards with a raw toggle", () => {
    renderView({ text: JSON.stringify({ words: 5, characters: 29 }) });
    expect(screen.getByText("Words")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Show raw data")).toBeInTheDocument();
  });

  it("renders scalar arrays as a list and booleans with text", () => {
    renderView({ text: JSON.stringify(["a", "b"]) });
    expect(screen.getByText("a")).toBeInTheDocument();
    renderView({ text: JSON.stringify({ valid: false }) });
    expect(screen.getByText("✕ No")).toBeInTheDocument();
  });

  it("marks errors as alerts without cards", () => {
    renderView({ text: "Check the input and try again.", error: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Check the input");
  });

  it("renders tables and image downloads", () => {
    const { container } = renderView({
      text: "a,b\n1,2",
      table: { head: ["A", "B"], rows: [["1", "2"]] },
      image: "data:image/svg+xml,abc",
      label: "Output",
    });
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Download image")).toHaveAttribute("href", "data:image/svg+xml,abc");
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("keeps nested JSON as an untouched block", () => {
    renderView({ text: JSON.stringify({ a: { b: { c: 1 } } }) });
    expect(screen.getByRole("status")).toHaveTextContent('"c":1');
  });

  it("has no axe violations for cards and tables", async () => {
    const { container } = renderView({
      text: JSON.stringify({ words: 5 }),
      table: { head: ["Word", "Count"], rows: [["hello", "2"]] },
    });
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
