import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DashboardHomeNew } from "./dashboard-home-new";

vi.mock("@/lib/app-api/client", () => ({
  listOpportunitiesPage: vi.fn(),
}));

import { listOpportunitiesPage } from "@/lib/app-api/client";

const mockedList = vi.mocked(listOpportunitiesPage);

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardHomeNew initialCounts={{ needsYou: 2, mine: 1 }} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedList.mockResolvedValue({ ok: true, status: 200, data: { items: [], total: 0, offset: 0 } });
});

describe("DashboardHomeNew", () => {
  it("renders action tiles with initial counts", () => {
    renderHome();
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByText("2 deals need you")).toBeInTheDocument();
    expect(screen.getByText("Submit a listing")).toBeInTheDocument();
    expect(screen.getByText("1 in your queue")).toBeInTheDocument();
    expect(screen.getByText("View analytics →")).toBeInTheDocument();
  });
});
