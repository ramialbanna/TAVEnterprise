import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { InterfaceProvider, useInterface } from "./interface-provider";

const STORAGE_KEY = "tav.interface";

function Probe() {
  const { interfaceMode, setInterfaceMode } = useInterface();
  return (
    <div>
      <span data-testid="mode">{interfaceMode}</span>
      <button type="button" onClick={() => setInterfaceMode("new")}>
        Set new
      </button>
      <button type="button" onClick={() => setInterfaceMode("classic")}>
        Set classic
      </button>
    </div>
  );
}

function Wrapper({ children }: { children: ReactNode }) {
  return <InterfaceProvider>{children}</InterfaceProvider>;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("InterfaceProvider", () => {
  it("defaults to classic", () => {
    render(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("classic");
  });

  it("restores preference from localStorage on mount", () => {
    window.localStorage.setItem(STORAGE_KEY, "new");
    render(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("new");
  });

  it("persists preference when changed", async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );
    await user.click(screen.getByRole("button", { name: "Set new" }));
    expect(screen.getByTestId("mode")).toHaveTextContent("new");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("new");

    await user.click(screen.getByRole("button", { name: "Set classic" }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("classic");
  });
});
