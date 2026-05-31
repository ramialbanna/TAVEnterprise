import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { OpportunityRow } from "@/lib/app-api/schemas";

import { OpportunitiesMobileActionBar } from "./opportunities-mobile-action-bar";

const row: OpportunityRow = {
  id: "listing-1",
  type: "lead",
  badges: [],
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
  firstSeenAt: null,
  lastSeenAt: null,
  seenCount: 1,
  listingUrl: "https://example.com/listing",
  estimateFlags: { mmr: false, mileage: false, style: false },
};

describe("OpportunitiesMobileActionBar", () => {
  it("renders listing and navigation actions", () => {
    render(
      <OpportunitiesMobileActionBar
        row={row}
        claimActor={{ id: "u1", displayName: "Alex", role: "closer" }}
        claimPending={false}
        onClaim={vi.fn()}
        onOpenDetail={vi.fn()}
      />,
    );

    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(screen.getByText("View listing")).toBeInTheDocument();
    expect(screen.getByText("Open full page")).toBeInTheDocument();
    expect(screen.getByText("I'm working this")).toBeInTheDocument();
  });
});
