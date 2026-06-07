import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ApiResult } from "@/lib/app-api";
import type { OpportunityListPage } from "@/lib/app-api/schemas";

import { OpportunitiesInterfaceClient } from "./opportunities-interface-client";

vi.mock("./opportunities-client-new", () => ({
  OpportunitiesClientNew: () => <div>New opportunities</div>,
}));

const emptyNew: ApiResult<OpportunityListPage> = {
  ok: true,
  status: 200,
  data: { items: [], total: 0, offset: 0 },
};

describe("OpportunitiesInterfaceClient", () => {
  it("renders New mode", () => {
    render(<OpportunitiesInterfaceClient initialNew={emptyNew} />);
    expect(screen.getByText("New opportunities")).toBeInTheDocument();
  });
});
