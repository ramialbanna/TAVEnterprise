import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiResult } from "@/lib/app-api";
import type { AppUser, OpportunityAction } from "@/lib/app-api/schemas";

import { OpportunityWorkflowPanel } from "./opportunity-workflow-panel";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
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

import {
  addOpportunityNote,
  evaluateOpportunity,
  getAppMe,
  updateOpportunityStatus,
} from "@/lib/app-api/client";

const mockedMe = vi.mocked(getAppMe);
const mockedEvaluate = vi.mocked(evaluateOpportunity);
const mockedStatus = vi.mocked(updateOpportunityStatus);
const mockedNote = vi.mocked(addOpportunityNote);

const closerUser: AppUser = {
  id: "closer-1",
  email: "closer@texasautovalue.com",
  displayName: "Closer One",
  role: "closer",
  isActive: true,
  createdAt: "2026-05-22T00:00:00.000Z",
  updatedAt: "2026-05-22T00:00:00.000Z",
};

const baseOpportunity = {
  id: "listing-1",
  assignedTo: "closer-1",
  assignedCloserName: "Closer One",
  claimedBy: "Closer One",
  claimedAt: "2026-05-23T00:00:00.000Z",
  claimExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  lastEvaluatedBy: null,
  lastEvaluatedAt: null,
  status: "claimed",
};

const updatedDetail = {
  id: "listing-1",
  type: "lead" as const,
  badges: [],
  source: "facebook",
  region: "dallas_tx",
  sourceRunId: null,
  normalizedListingId: "listing-1",
  vehicleCandidateId: null,
  leadId: null,
  title: "2019 Ford F-150",
  year: 2019,
  make: "Ford",
  model: "F-150",
  style: null,
  vin: null,
  price: 25000,
  mmrValue: 28000,
  spread: 3000,
  finalScore: 72,
  grade: "good",
  status: "reviewed",
  submittedBy: null,
  assignedTo: "closer-1",
  assignedCloserName: "Closer One",
  claimedBy: "Closer One",
  claimedAt: "2026-05-23T00:00:00.000Z",
  claimExpiresAt: baseOpportunity.claimExpiresAt,
  lastEvaluatedBy: null,
  lastEvaluatedAt: null,
  firstSeenAt: null,
  lastSeenAt: null,
  seenCount: 1,
  listingUrl: null,
  estimateFlags: { mileage: false, style: false, mmr: false },
  reasonCodes: [],
  valuationMissingReason: null,
  scoreComponents: null,
  candidateListingCount: null,
  mileage: null,
  actions: [],
  catalogMatchSuggestions: [],
};

function TestWrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedMe.mockResolvedValue({ ok: true, status: 200, data: closerUser } satisfies ApiResult<AppUser>);
  mockedEvaluate.mockResolvedValue({ ok: true, status: 200, data: updatedDetail });
  mockedStatus.mockResolvedValue({ ok: true, status: 200, data: updatedDetail });
  mockedNote.mockResolvedValue({ ok: true, status: 200, data: updatedDetail });
});

describe("OpportunityWorkflowPanel", () => {
  it("updates workflow status for an eligible closer", async () => {
    const user = userEvent.setup();

    render(
      <OpportunityWorkflowPanel opportunity={baseOpportunity} recordEvaluation={false} />,
      { wrapper: TestWrapper },
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reviewed" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Reviewed" }));

    await waitFor(() => {
      expect(mockedStatus).toHaveBeenCalledWith("listing-1", { status: "reviewed" });
    });
  });

  it("adds a note for an eligible closer", async () => {
    const user = userEvent.setup();

    render(
      <OpportunityWorkflowPanel opportunity={baseOpportunity} recordEvaluation={false} />,
      { wrapper: TestWrapper },
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/add note/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/add note/i), "Seller asked for best offer");
    await user.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() => {
      expect(mockedNote).toHaveBeenCalledWith("listing-1", {
        note: "Seller asked for best offer",
      });
    });
  });

  it("renders action history when enabled", () => {
    const actions: OpportunityAction[] = [
      {
        id: "action-1",
        normalizedListingId: "listing-1",
        actorUserId: "closer-1",
        actorName: "Closer One",
        action: "note_added",
        notes: "Follow up tomorrow",
        metadata: {},
        createdAt: "2026-05-23T12:00:00.000Z",
      },
    ];

    render(
      <OpportunityWorkflowPanel
        opportunity={baseOpportunity}
        actions={actions}
        showActionHistory
        recordEvaluation={false}
      />,
      { wrapper: TestWrapper },
    );

    expect(screen.getByText("Action history")).toBeInTheDocument();
    expect(screen.getByText("Follow up tomorrow")).toBeInTheDocument();
  });
});
