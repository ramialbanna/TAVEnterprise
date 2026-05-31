import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { InterfaceProvider } from "@/lib/interface/interface-provider";

import { OpportunitiesPageIntro } from "./opportunities-page-intro";

beforeEach(() => {
  window.localStorage.clear();
});

describe("OpportunitiesPageIntro", () => {
  it("shows Classic copy by default", () => {
    render(
      <InterfaceProvider>
        <OpportunitiesPageIntro />
      </InterfaceProvider>,
    );
    expect(screen.getByRole("heading", { name: "Opportunities" })).toBeInTheDocument();
    expect(screen.getByText(/Compare asking price to MMR/)).toBeInTheDocument();
  });

  it("shows New copy when preference is new", () => {
    window.localStorage.setItem("tav.interface", "new");
    render(
      <InterfaceProvider>
        <OpportunitiesPageIntro />
      </InterfaceProvider>,
    );
    expect(screen.getByText(/wholesale value/)).toBeInTheDocument();
    expect(screen.queryByText(/Compare asking price to MMR/)).not.toBeInTheDocument();
  });
});
