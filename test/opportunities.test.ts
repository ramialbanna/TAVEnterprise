import { describe, it, expect } from "vitest";
import {
  buildOpportunityBadges,
  isReviewableNearMiss,
  matchesNeedsAction,
  matchesMine,
  matchesWorthALook,
  sortOpportunityRows,
  paginateOpportunityRows,
  type OpportunityRow,
} from "../src/persistence/opportunities";
import type { WorkflowDisplayContext } from "../src/persistence/opportunityWorkflow";

function sampleRow(over: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    id: "listing-1",
    type: "lead",
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
    price: 20_000,
    mmrValue: 24_000,
    spread: 4_000,
    finalScore: 80,
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
    firstSeenAt: "2026-05-20T10:00:00.000Z",
    lastSeenAt: "2026-05-21T10:00:00.000Z",
    seenCount: 1,
    listingUrl: null,
    estimateFlags: { mileage: false, style: false, mmr: false },
    ...over,
  };
}

describe("isReviewableNearMiss", () => {
  it("accepts at-or-below-MMR listings with complete YMM", () => {
    expect(
      isReviewableNearMiss({
        freshnessStatus: "active",
        price: 18_000,
        mmrValue: 20_000,
        year: 2019,
        make: "Ford",
        model: "F-150",
      }),
    ).toBe(true);
  });

  it("rejects stale_confirmed and removed freshness", () => {
    expect(
      isReviewableNearMiss({
        freshnessStatus: "stale_confirmed",
        price: 10_000,
        mmrValue: 12_000,
        year: 2018,
        make: "Honda",
        model: "Civic",
      }),
    ).toBe(false);
    expect(
      isReviewableNearMiss({
        freshnessStatus: "removed",
        price: 10_000,
        mmrValue: 12_000,
        year: 2018,
        make: "Honda",
        model: "Civic",
      }),
    ).toBe(false);
  });

  it("rejects overpriced and incomplete identity", () => {
    expect(
      isReviewableNearMiss({
        freshnessStatus: "new",
        price: 25_000,
        mmrValue: 20_000,
        year: 2019,
        make: "Ford",
        model: "F-150",
      }),
    ).toBe(false);
    expect(
      isReviewableNearMiss({
        freshnessStatus: "new",
        price: 18_000,
        mmrValue: 20_000,
        year: null,
        make: "Ford",
        model: "F-150",
      }),
    ).toBe(false);
  });
});

describe("buildOpportunityBadges", () => {
  it("marks first sighting and near miss", () => {
    const badges = buildOpportunityBadges({
      scrapeCount: 1,
      priceChanged: false,
      mileageChanged: false,
      mileageUnknown: false,
      hasLead: false,
      hasMmr: true,
      isManualSubmission: false,
      estimateFlags: { mileage: false, style: false, mmr: false },
      candidateListingCount: 1,
    });
    expect(badges).toContain("First seen");
    expect(badges).toContain("Near miss");
  });

  it("marks repeat sighting and price change", () => {
    const badges = buildOpportunityBadges({
      scrapeCount: 3,
      priceChanged: true,
      mileageChanged: false,
      mileageUnknown: false,
      hasLead: true,
      hasMmr: true,
      isManualSubmission: false,
      estimateFlags: { mileage: true, style: false, mmr: true },
      candidateListingCount: 2,
    });
    expect(badges).toContain("Seen again #2");
    expect(badges).toContain("Price changed");
    expect(badges).toContain("Estimated miles");
    expect(badges).toContain("Estimated MMR");
    expect(badges).toContain("Possible duplicate");
    expect(badges).not.toContain("Near miss");
  });

  it("marks manual submissions", () => {
    const badges = buildOpportunityBadges({
      scrapeCount: 1,
      priceChanged: false,
      mileageChanged: false,
      mileageUnknown: false,
      hasLead: false,
      hasMmr: false,
      isManualSubmission: true,
      estimateFlags: { mileage: false, style: false, mmr: false },
      candidateListingCount: null,
    });
    expect(badges).toContain("Manual submission");
  });

  it("marks mileage unknown when listing has no miles", () => {
    const badges = buildOpportunityBadges({
      scrapeCount: 1,
      priceChanged: false,
      mileageChanged: false,
      mileageUnknown: true,
      hasLead: false,
      hasMmr: false,
      isManualSubmission: true,
      estimateFlags: { mileage: false, style: false, mmr: false },
      candidateListingCount: null,
    });
    expect(badges).toContain("Mileage unknown");
  });
});

describe("opportunity list views and pagination", () => {
  const now = new Date("2026-05-21T12:00:00.000Z");

  it("matchesNeedsAction for unassigned and expiring claims", () => {
    expect(matchesNeedsAction(sampleRow({ assignedTo: null }), null)).toBe(true);
    const workflow = {
      claimedByUserId: "user-1",
      claimExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    } as WorkflowDisplayContext;
    expect(matchesNeedsAction(sampleRow({ assignedTo: "user-2" }), workflow)).toBe(true);
  });

  it("matchesMine for assignee and active claim owner", () => {
    const workflow = {
      claimedByUserId: "user-1",
      claimExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    } as WorkflowDisplayContext;
    expect(matchesMine(sampleRow({ assignedTo: "user-1" }), null, "user-1")).toBe(true);
    expect(matchesMine(sampleRow({ assignedTo: "user-2" }), workflow, "user-1")).toBe(true);
    expect(matchesMine(sampleRow({ assignedTo: "user-2" }), workflow, "user-3")).toBe(false);
  });

  it("matchesWorthALook for strong spread and recent listings", () => {
    expect(matchesWorthALook(sampleRow({ spread: 4_000 }), now)).toBe(true);
    expect(matchesWorthALook(sampleRow({ spread: 100 }), now)).toBe(false);
    expect(
      matchesWorthALook(
        sampleRow({ spread: 4_000, lastSeenAt: "2026-05-01T10:00:00.000Z" }),
        now,
      ),
    ).toBe(false);
  });

  it("sortOpportunityRows orders by spread desc", () => {
    const rows = [
      sampleRow({ id: "a", spread: 1_000, lastSeenAt: "2026-05-21T10:00:00.000Z" }),
      sampleRow({ id: "b", spread: 5_000, lastSeenAt: "2026-05-20T10:00:00.000Z" }),
    ];
    sortOpportunityRows(rows, "spread_desc");
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("paginateOpportunityRows slices with total", () => {
    const rows = [sampleRow({ id: "a" }), sampleRow({ id: "b" }), sampleRow({ id: "c" })];
    const page = paginateOpportunityRows(rows, 1, 1);
    expect(page).toEqual({ items: [rows[1]], total: 3, offset: 1 });
  });
});
