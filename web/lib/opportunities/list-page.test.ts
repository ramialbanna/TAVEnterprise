import { describe, expect, it } from "vitest";

import { paginateOpportunityRowsClient } from "./list-page";
import type { OpportunityRow } from "@/lib/app-api/schemas";

const row = (id: string, spread: number | null): OpportunityRow =>
  ({
    id,
    type: "lead",
    badges: [],
    source: "facebook",
    region: "dallas_tx",
    sourceRunId: null,
    normalizedListingId: id,
    vehicleCandidateId: null,
    leadId: null,
    title: id,
    year: 2020,
    make: "Ford",
    model: "F-150",
    style: null,
    vin: null,
    price: 10000,
    mmrValue: 12000,
    spread,
    finalScore: 70,
    grade: "good",
    status: "new",
    submittedBy: null,
    assignedTo: null,
    assignedCloserName: null,
    claimedBy: null,
    claimedAt: null,
    claimExpiresAt: null,
    lastEvaluatedBy: null,
    lastEvaluatedAt: null,
    firstSeenAt: "2026-05-01T00:00:00.000Z",
    lastSeenAt: "2026-05-01T00:00:00.000Z",
    seenCount: 1,
    listingUrl: null,
    estimateFlags: { mileage: false, style: false, mmr: false },
  }) as OpportunityRow;

describe("paginateOpportunityRowsClient", () => {
  it("sorts by spread desc and slices a page", () => {
    const page = paginateOpportunityRowsClient(
      [row("low", 100), row("high", 3000), row("mid", 1500)],
      { offset: 0, limit: 2, sort: "spread_desc" },
    );

    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.id)).toEqual(["high", "mid"]);
  });
});
