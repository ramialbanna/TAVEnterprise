import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { OpportunityRow } from "@/lib/app-api/schemas";

import { ClaimFeedbackInline } from "./claim-feedback-inline";

const row: OpportunityRow = {
  id: "opp-1",
  type: "lead",
  badges: [],
  source: "facebook",
  region: "dallas_tx",
  sourceRunId: null,
  normalizedListingId: "opp-1",
  vehicleCandidateId: null,
  leadId: null,
  title: "2019 Honda Civic",
  year: 2019,
  make: "Honda",
  model: "Civic",
  style: null,
  vin: null,
  price: 16000,
  mmrValue: 17200,
  spread: 1200,
  finalScore: 78,
  grade: "good",
  status: "claimed",
  submittedBy: null,
  assignedTo: null,
  assignedCloserName: null,
  claimedBy: "QA",
  claimedAt: new Date().toISOString(),
  claimExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  lastEvaluatedBy: null,
  lastEvaluatedAt: null,
  firstSeenAt: null,
  lastSeenAt: null,
  seenCount: 1,
  listingUrl: null,
  estimateFlags: { mmr: false, mileage: false, style: false },
};

describe("ClaimFeedbackInline", () => {
  it("shows claim confirmation and dismisses", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<ClaimFeedbackInline row={row} onDismiss={onDismiss} />);

    expect(screen.getByRole("status")).toHaveTextContent(/I'm working this/);
    expect(screen.getByText(/2019 Honda Civic/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
