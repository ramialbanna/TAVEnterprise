import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiResult } from "@/lib/app-api";
import type { OpportunityListPage, OpportunityRow } from "@/lib/app-api/schemas";

import { OpportunitiesClientNew } from "./opportunities-client-new";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/app-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/app-api/client")>();
  return {
    ...actual,
    listOpportunitiesPage: vi.fn(),
    getAppMe: vi.fn(),
    claimOpportunity: vi.fn(),
  };
});

import { getAppMe, listOpportunitiesPage } from "@/lib/app-api/client";

const mockedList = vi.mocked(listOpportunitiesPage);
const mockedMe = vi.mocked(getAppMe);

const sampleRow: OpportunityRow = {
  id: "listing-1",
  type: "lead",
  badges: ["First seen"],
  source: "facebook",
  region: "dallas_tx",
  sourceRunId: null,
  normalizedListingId: "listing-1",
  vehicleCandidateId: null,
  leadId: "lead-1",
  title: "2019 Honda Accord",
  year: 2019,
  make: "Honda",
  model: "Accord",
  style: null,
  vin: null,
  price: 12000,
  mmrValue: 15000,
  spread: 3000,
  finalScore: 82,
  grade: "excellent",
  status: "new",
  submittedBy: null,
  assignedTo: null,
  assignedCloserName: null,
  claimedBy: null,
  claimedAt: null,
  claimExpiresAt: null,
  lastEvaluatedBy: null,
  lastEvaluatedAt: null,
  firstSeenAt: (() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0).toISOString();
  })(),
  lastSeenAt: (() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0).toISOString();
  })(),
  receivedAt: (() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0).toISOString();
  })(),
  seenCount: 1,
  listingUrl: "https://example.com/listing",
  estimateFlags: { mmr: false, mileage: false, style: false },
};

function page(
  items: OpportunityRow[],
  total = items.length,
): ApiResult<OpportunityListPage> {
  return { ok: true, status: 200, data: { items, total, offset: 0 } };
}

function TestWrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("OpportunitiesClientNew", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mockedList.mockImplementation(async (filter) => {
      if (filter?.view === "worth_a_look") {
        return page([], 0);
      }
      if (filter?.view === "mine") {
        return page([], 0);
      }
      if (filter?.view === "all" && filter.limit === 100) {
        return page([sampleRow], 1);
      }
      if (filter?.limit === 1) {
        const total = filter.view === "needs_action" ? 1 : 0;
        return page([], total);
      }
      return page([sampleRow], 1);
    });
  });

  it("shows human summary and queue tabs", async () => {
    render(
      <OpportunitiesClientNew
        initial={page([sampleRow], 1)}
        initialView="needs_action"
      />,
      { wrapper: TestWrapper },
    );

    await waitFor(() => {
      expect(screen.getByText(/1 need you/)).toBeInTheDocument();
      expect(screen.getByText(/1 new today/)).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: /Needs action/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("2019 Honda Accord")).toBeInTheDocument();
  });
});
