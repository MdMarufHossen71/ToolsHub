// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Router } from "wouter";
import { AppSettingsProvider } from "@/contexts/AppSettingsContext";
import type { Tool } from "@/data/tools";
import { ToolCard } from "./ToolCard";

const tool: Tool = {
  name: "Word Counter",
  slug: "word-counter",
  category: "Text",
  categoryBn: "টেক্সট",
  group: "text",
  description: { en: "Count words.", bn: "শব্দ গুনুন।" },
  keywords: ["words", "count"],
};

/** wouter needs a location hook; the app uses hashing, tests use a static one. */
const useStaticLocation: () => [string, (to: string) => void] = () => ["/", () => {}];

function renderCard() {
  return render(
    <Router hook={useStaticLocation}>
      <AppSettingsProvider>
        <ToolCard tool={tool} />
      </AppSettingsProvider>
    </Router>,
  );
}

describe("ToolCard", () => {
  it("renders the tool name, category and a link to the tool page", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Word Counter" })).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/tools/word-counter");
  });

  it("toggles the favorite star with an accessible pressed state", async () => {
    const user = userEvent.setup();
    renderCard();
    const star = screen.getByRole("button", { name: /word counter/i });
    expect(star).toHaveAttribute("aria-pressed", "false");
    await user.click(star);
    expect(star).toHaveAttribute("aria-pressed", "true");
    await user.click(star);
    expect(star).toHaveAttribute("aria-pressed", "false");
  });

  it("has no axe violations", async () => {
    const { container } = renderCard();
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
