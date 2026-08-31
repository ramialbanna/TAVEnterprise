import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { OpportunitiesInterfaceClient } from "./opportunities-interface-client";

vi.mock("./opportunities-client-new", () => ({
  OpportunitiesClientNew: () => <div>New opportunities</div>,
}));

describe("OpportunitiesInterfaceClient", () => {
  it("renders New mode", () => {
    render(<OpportunitiesInterfaceClient />);
    expect(screen.getByText("New opportunities")).toBeInTheDocument();
  });
});
