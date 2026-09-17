// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { Router } from "wouter";
import { AppSettingsProvider } from "@/contexts/AppSettingsContext";
import { SearchBox } from "@/components/SearchBox";
import { ToolWorkspace } from "@/components/ToolWorkspace";
import { findTool } from "@/data/tools";

const useStaticLocation: () => [string, (to: string) => void] = () => ["/", () => {}];

function renderWithProviders(ui: React.ReactNode) {
  return render(
    <Router hook={useStaticLocation}>
      <AppSettingsProvider>{ui}</AppSettingsProvider>
    </Router>,
  );
}

describe("search + workspace accessibility", () => {
  it("SearchBox has no axe violations", async () => {
    const { container } = renderWithProviders(
      <SearchBox id="a11y-search" onSubmit={() => {}} />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it("ToolWorkspace (word-counter) has no axe violations", async () => {
    const tool = findTool("word-counter");
    expect(tool).toBeDefined();
    const { container } = renderWithProviders(<ToolWorkspace tool={tool!} />);
    expect(screen.getByRole("heading", { name: "Word Counter" })).toBeInTheDocument();
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it("ToolWorkspace unavailable state has no axe violations", async () => {
    // A catalogue entry with no implementation yet: the honest "not built"
    // panel, kept working for whatever the next tool wave adds.
    const { container } = renderWithProviders(
      <ToolWorkspace
        tool={{
          name: "Future Tool",
          slug: "future-tool-not-built",
          category: "Misc",
          categoryBn: "বিবিধ",
          group: "misc",
          description: { en: "Not built yet.", bn: "এখনো তৈরি হয়নি।" },
          keywords: ["future"],
        }}
      />,
    );
    expect(screen.getByRole("note")).toBeInTheDocument();
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
