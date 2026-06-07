import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { InterfaceProvider, useInterface } from "./interface-provider";

function Probe() {
  const { interfaceMode } = useInterface();
  return <span data-testid="mode">{interfaceMode}</span>;
}

function Wrapper({ children }: { children: ReactNode }) {
  return <InterfaceProvider>{children}</InterfaceProvider>;
}

describe("InterfaceProvider", () => {
  it("always returns new mode", () => {
    render(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("new");
  });
});
