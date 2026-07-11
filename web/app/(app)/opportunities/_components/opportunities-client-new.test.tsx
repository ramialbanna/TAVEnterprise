import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiResult } from "@/lib/app-api";
import type { OpportunityListPage, OpportunityRow } from "@/lib/app-api/schemas";

import { OpportunitiesClientNew } from "./opportunities-client-new";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/app-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/app-api/client")>();
  return {
    ...actual,
    listOpportunitiesPage: vi.fn(),
    getAppMe: vi.fn(),
    claimOpportunity: vi.fn(),
    dismissOpportunity: vi.fn(),
  };
});

import { dismissOpportunity, getAppMe, listOpportunitiesPage } from "@/lib/app-api/client";

const mockedList = vi.mocked(listOpportunitiesPage);
const mockedMe = vi.mocked(getAppMe);
const mockedDismiss = vi.mocked(dismissOpportunity);

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

  it("selects the clicked tab immediately and keeps the queue shell mounted (#43/#52)", async () => {
    const user = userEvent.setup();
    let resolveWorth: ((value: ApiResult<OpportunityListPage>) => void) | undefined;
    const worthPromise = new Promise<ApiResult<OpportunityListPage>>((resolve) => {
      resolveWorth = resolve;
    });

    mockedList.mockImplementation(async (filter) => {
      if (filter?.view === "worth_a_look" && (filter.limit ?? 0) > 1) {
        return worthPromise;
      }
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

    render(
      <OpportunitiesClientNew
        initial={page([sampleRow], 1)}
        initialView="needs_action"
      />,
      { wrapper: TestWrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("2019 Honda Accord")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: /Worth a look/i }));

    // Optimistic selection — must not wait on network (#52).
    expect(screen.getByRole("tab", { name: /Worth a look/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Placeholder keeps prior rows / shell — no full-page "Loading opportunities…" (#43).
    expect(screen.queryByText("Loading opportunities…")).not.toBeInTheDocument();
    expect(screen.getByText("2019 Honda Accord")).toBeInTheDocument();
    expect(replace).toHaveBeenCalled();

    resolveWorth?.(page([], 0));

    await waitFor(() => {
      expect(screen.queryByText("2019 Honda Accord")).not.toBeInTheDocument();
    });
  });

  it("removes a flagged lead from the queue without a full page refresh", async () => {
    const user = userEvent.setup();
    let dismissed = false;
    mockedDismiss.mockImplementation(async () => {
      dismissed = true;
      return {
        ok: true,
        status: 200,
        data: {
          ...sampleRow,
          status: "bad_lead",
          reasonCodes: [],
          valuationMissingReason: null,
          scoreComponents: null,
          candidateListingCount: null,
          mileage: null,
          actions: [],
        },
      };
    });

    mockedList.mockImplementation(async (filter) => {
      if (filter?.view === "worth_a_look") return page([], 0);
      if (filter?.view === "mine") return page([], 0);
      if (filter?.view === "all" && filter.limit === 100) {
        return dismissed ? page([], 0) : page([sampleRow], 1);
      }
      if (filter?.limit === 1) {
        const total = filter.view === "needs_action" && !dismissed ? 1 : 0;
        return page([], total);
      }
      return dismissed ? page([], 0) : page([sampleRow], 1);
    });

    render(
      <OpportunitiesClientNew
        initial={page([sampleRow], 1)}
        initialView="needs_action"
      />,
      { wrapper: TestWrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("2019 Honda Accord")).toBeInTheDocument();
      expect(screen.getByLabelText("Flag bad lead")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Flag bad lead"));
    await user.click(screen.getByRole("radio", { name: /Dealer/i }));
    await user.click(screen.getByRole("button", { name: /^Flag bad lead$/i }));

    await waitFor(() => {
      expect(mockedDismiss).toHaveBeenCalledWith("listing-1", {
        reason: "dealer",
        notes: undefined,
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("2019 Honda Accord")).not.toBeInTheDocument();
    });
  });
});
