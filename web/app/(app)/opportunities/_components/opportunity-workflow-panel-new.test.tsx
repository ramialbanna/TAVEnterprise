import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { AppUser } from "@/lib/app-api/schemas";

import { OpportunityWorkflowPanelNew } from "./opportunity-workflow-panel-new";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/lib/app-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/app-api/client")>();
  return {
    ...actual,
    getAppMe: vi.fn(),
    listAppUsers: vi.fn(),
    evaluateOpportunity: vi.fn(),
    claimOpportunity: vi.fn(),
    assignOpportunity: vi.fn(),
    updateOpportunityStatus: vi.fn(),
    addOpportunityNote: vi.fn(),
  };
});

import { claimOpportunity, getAppMe, updateOpportunityStatus } from "@/lib/app-api/client";

const mockedMe = vi.mocked(getAppMe);
const mockedClaim = vi.mocked(claimOpportunity);
const mockedStatus = vi.mocked(updateOpportunityStatus);

const closerUser: AppUser = {
  id: "closer-1",
  email: "closer@texasautovalue.com",
  displayName: "Closer One",
  role: "closer",
  isActive: true,
  createdAt: "2026-05-22T00:00:00.000Z",
  updatedAt: "2026-05-22T00:00:00.000Z",
};

function TestWrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedMe.mockResolvedValue({ ok: true, status: 200, data: closerUser });
  mockedClaim.mockResolvedValue({ ok: true, status: 200, data: {} as never });
  mockedStatus.mockResolvedValue({ ok: true, status: 200, data: {} as never });
});

describe("OpportunityWorkflowPanelNew", () => {
  it("renders the progress stepper and primary claim action", async () => {
    render(
      <OpportunityWorkflowPanelNew
        opportunity={{
          id: "listing-1",
          status: "new",
          assignedTo: null,
          assignedCloserName: null,
          claimedBy: null,
          claimedAt: null,
          claimExpiresAt: null,
          lastEvaluatedBy: null,
          lastEvaluatedAt: null,
        }}
        recordEvaluation={false}
      />,
      { wrapper: TestWrapper },
    );

    expect(screen.getByText("Deal progress")).toBeInTheDocument();
    expect(screen.getByText("Found")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "I'm working this" })).toBeInTheDocument();
    });
  });

  it("claims via the primary action", async () => {
    const user = userEvent.setup();

    render(
      <OpportunityWorkflowPanelNew
        opportunity={{
          id: "listing-1",
          status: "new",
          assignedTo: null,
          assignedCloserName: null,
          claimedBy: null,
          claimedAt: null,
          claimExpiresAt: null,
          lastEvaluatedBy: null,
          lastEvaluatedAt: null,
        }}
        recordEvaluation={false}
      />,
      { wrapper: TestWrapper },
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "I'm working this" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "I'm working this" }));

    await waitFor(() => {
      expect(mockedClaim).toHaveBeenCalledWith("listing-1");
    });
  });

  it("shows audit details in a collapsible section", async () => {
    render(
      <OpportunityWorkflowPanelNew
        opportunity={{
          id: "listing-1",
          status: "claimed",
          assignedTo: "closer-1",
          assignedCloserName: "Closer One",
          claimedBy: "Closer One",
          claimedAt: "2026-05-23T00:00:00.000Z",
          claimExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          lastEvaluatedBy: null,
          lastEvaluatedAt: null,
        }}
        recordEvaluation={false}
      />,
      { wrapper: TestWrapper },
    );

    expect(screen.getByText("Details")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Mark contacted" })).toBeInTheDocument();
    });
  });
});
