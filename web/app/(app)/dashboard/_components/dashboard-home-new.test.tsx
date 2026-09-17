import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DashboardHomeNew } from "./dashboard-home-new";

vi.mock("@/lib/app-api/client", () => ({
  getOpportunityCounts: vi.fn(),
  getAppMe: vi.fn(),
}));

import { getAppMe, getOpportunityCounts } from "@/lib/app-api/client";

const mockedCounts = vi.mocked(getOpportunityCounts);
const mockedMe = vi.mocked(getAppMe);

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardHomeNew initialCounts={{ needsYou: 2, mine: 1 }} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedMe.mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      id: "u1",
      email: "alex@texasautovalue.com",
      displayName: "Alex",
      role: "closer",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  mockedCounts.mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      needs_action: 0,
      mine: 0,
      worth_a_look: 0,
      scraper_review: 0,
      flagged_leads: 0,
      all: 0,
      new_today: 0,
    },
  });
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
