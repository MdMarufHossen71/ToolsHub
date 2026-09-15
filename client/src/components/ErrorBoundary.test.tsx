// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import ErrorBoundary from "./ErrorBoundary";

function Boom(): never {
  throw new Error("boom");
}

function Flaky({ fixed }: { fixed: boolean }) {
  if (!fixed) throw new Error("boom");
  return <p>recovered</p>;
}

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("fine")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the fallback panel with role=alert when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
      expect(screen.getByRole("alert")).toBeInTheDocument();
      // Retry + home actions are real buttons/links, reachable by keyboard.
      expect(screen.getByRole("button")).toBeInTheDocument();
      expect(screen.getByRole("link")).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  it("retry clears the error so a fixed route renders again", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    try {
      // Drive recovery through the boundary's own retry button: fix the
      // underlying tree first, then retry and expect the page back. The
      // capture runs in an effect (not during render) so the tree stays pure.
      const control: { fix?: (value: boolean) => void } = {};
      function Outer() {
        const [fixed, setFixedState] = useState(false);
        useEffect(() => {
          control.fix = setFixedState;
        }, []);
        return (
          <ErrorBoundary>
            <Flaky fixed={fixed} />
          </ErrorBoundary>
        );
      }
      const { rerender } = render(<Outer />);
      expect(screen.getByRole("alert")).toBeInTheDocument();
      control.fix?.(true);
      rerender(<Outer />);
      await user.click(screen.getByRole("button"));
      expect(await screen.findByText("recovered")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});
