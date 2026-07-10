import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { OpportunityRow } from "@/lib/app-api/schemas";

import { OpportunitiesTableNew } from "./opportunities-table-new";

const baseRow: OpportunityRow = {
  id: "listing-1",
  type: "near_miss",
  badges: ["Near miss"],
  source: "facebook",
  region: "dallas_tx",
  sourceRunId: null,
  normalizedListingId: "listing-1",
  vehicleCandidateId: null,
  leadId: null,
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
  grade: null,
  status: "new",
  submittedBy: null,
  assignedTo: null,
  assignedCloserName: null,
  claimedBy: null,
  claimedAt: null,
  claimExpiresAt: null,
  lastEvaluatedBy: null,
  lastEvaluatedAt: null,
  firstSeenAt: "2026-05-01T12:00:00Z",
  lastSeenAt: "2026-05-01T12:00:00Z",
  receivedAt: "2026-05-01T11:00:00Z",
  seenCount: 1,
  listingUrl: "https://example.com/listing",
  estimateFlags: { mmr: false, mileage: false, style: false },
};

describe("OpportunitiesTableNew", () => {
  it("renders spread signal and quick actions", () => {
    render(
      <OpportunitiesTableNew
        rows={[baseRow]}
        total={1}
        offset={0}
        limit={25}
        sort="spread_desc"
        claimActor={{ id: "u1", displayName: "Alex", role: "closer" }}
        onSelect={vi.fn()}
        onOpenDetail={vi.fn()}
        onPaginationChange={vi.fn()}
        onSortChange={vi.fn()}
        onClaim={vi.fn()}
        onDismiss={vi.fn()}
        queueView="needs_action"
      />,
    );

    expect(screen.getByText("$3,000 under")).toBeInTheDocument();
    expect(screen.getByText("2019 Honda Accord")).toBeInTheDocument();
    expect(screen.getAllByLabelText("View listing").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("I'm working this")).toBeInTheDocument();
    expect(screen.getByLabelText("Flag bad lead")).toBeInTheDocument();
  });

  it("highlights the selected row", () => {
    render(
      <OpportunitiesTableNew
        rows={[baseRow]}
        total={1}
        offset={0}
        limit={25}
        sort="spread_desc"
        selectedId="listing-1"
        claimActor={null}
        onSelect={vi.fn()}
        onOpenDetail={vi.fn()}
        onPaginationChange={vi.fn()}
        onSortChange={vi.fn()}
        onClaim={vi.fn()}
        onDismiss={vi.fn()}
        queueView="needs_action"
      />,
    );

    expect(document.querySelector('[data-selected="true"]')).not.toBeNull();
  });

  it("calls onOpenDetail when a row is clicked", () => {
    const onOpenDetail = vi.fn();
    render(
      <OpportunitiesTableNew
        rows={[baseRow]}
        total={1}
        offset={0}
        limit={25}
        sort="spread_desc"
        claimActor={null}
        onSelect={vi.fn()}
        onOpenDetail={onOpenDetail}
        onPaginationChange={vi.fn()}
        onSortChange={vi.fn()}
        onClaim={vi.fn()}
        onDismiss={vi.fn()}
        queueView="needs_action"
      />,
    );

    fireEvent.click(screen.getByText("2019 Honda Accord"));
    expect(onOpenDetail).toHaveBeenCalledWith(baseRow);
  });
});
