import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ApiResult } from "@/lib/app-api";
import type { OpportunityListPage, OpportunityRow } from "@/lib/app-api/schemas";
import { InterfaceProvider } from "@/lib/interface/interface-provider";

import { OpportunitiesInterfaceClient } from "./opportunities-interface-client";

vi.mock("./opportunities-client-classic", () => ({
  OpportunitiesClientClassic: () => <div>Classic opportunities</div>,
}));

vi.mock("./opportunities-client-new", () => ({
  OpportunitiesClientNew: () => <div>New opportunities</div>,
}));

const emptyClassic: ApiResult<OpportunityRow[]> = { ok: true, status: 200, data: [] };
const emptyNew: ApiResult<OpportunityListPage> = {
  ok: true,
  status: 200,
  data: { items: [], total: 0, offset: 0 },
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("OpportunitiesInterfaceClient", () => {
  it("renders Classic mode by default", () => {
    render(
      <InterfaceProvider>
        <OpportunitiesInterfaceClient initialClassic={emptyClassic} initialNew={emptyNew} />
      </InterfaceProvider>,
    );
    expect(screen.getByText("Classic opportunities")).toBeInTheDocument();
  });

  it("renders New mode when preference is new", () => {
    window.localStorage.setItem("tav.interface", "new");
    render(
      <InterfaceProvider>
        <OpportunitiesInterfaceClient initialClassic={emptyClassic} initialNew={emptyNew} />
      </InterfaceProvider>,
    );
    expect(screen.getByText("New opportunities")).toBeInTheDocument();
  });
});
