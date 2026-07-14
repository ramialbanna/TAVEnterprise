import { describe, it, expect } from "vitest";
import {
  buildOpportunityBadges,
  isReviewableNearMiss,
  isSoftReviewableNearMiss,
  isWithinScraperReviewWindow,
  isScraperReviewNoMmrEligible,
  isScraperReviewOnly,
  matchesNeedsAction,
  matchesMine,
  matchesFlaggedLeads,
  matchesScraperReview,
  matchesWorthALook,
  sortOpportunityRows,
  paginateOpportunityRows,
  SCRAPER_REVIEW_BADGE,
  SCRAPER_REVIEW_WINDOW_MS,
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
    receivedAt: "2026-05-21T09:00:00.000Z",
    postedAt: null,
    seenCount: 1,
    listingUrl: null,
    entryMethod: null,
    estimateFlags: { mileage: false, style: false, mmr: false },
    maxbuySummary: null,
    bodyType: null,
    engine: null,
    transmission: null,
    color: null,
    contactFirstName: null,
    contactLastName: null,
    contactHomePhone: null,
    contactEmail: null,
    contactAddress: null,
    contactPostalCode: null,
    salesperson: null,
    appraiser: null,
    titleOwner: null,
    titleStateRegion: null,
    lienHolder: null,
    lienAccountNumber: null,
    lienPayoff: null,
    tagOrPlate: null,
    tagStateRegion: null,
    tagExpiration: null,
    certified: false,
    extendedWarranty: false,
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

  it("soft gate keeps overpriced MMR hits that fail deal-score", () => {
    const overpriced = {
      freshnessStatus: "new",
      price: 25_000,
      mmrValue: 20_000,
      year: 2019,
      make: "Ford",
      model: "F-150",
    };
    expect(isReviewableNearMiss(overpriced)).toBe(false);
    expect(isSoftReviewableNearMiss(overpriced)).toBe(true);
  });
});

describe("scraper review helpers (item 55)", () => {
  const now = new Date("2026-07-11T12:00:00.000Z");

  it("isWithinScraperReviewWindow respects lookback", () => {
    expect(isWithinScraperReviewWindow("2026-07-11T06:00:00.000Z", now)).toBe(true);
    expect(
      isWithinScraperReviewWindow(
        new Date(now.getTime() - SCRAPER_REVIEW_WINDOW_MS - 1).toISOString(),
        now,
      ),
    ).toBe(false);
    expect(isWithinScraperReviewWindow(null, now)).toBe(false);
  });

  it("isScraperReviewNoMmrEligible requires YMM and non-suppressed freshness", () => {
    expect(
      isScraperReviewNoMmrEligible({
        freshnessStatus: "new",
        year: 2020,
        make: "Honda",
        model: "Civic",
      }),
    ).toBe(true);
    expect(
      isScraperReviewNoMmrEligible({
        freshnessStatus: "removed",
        year: 2020,
        make: "Honda",
        model: "Civic",
      }),
    ).toBe(false);
    expect(
      isScraperReviewNoMmrEligible({
        freshnessStatus: "new",
        year: null,
        make: "Honda",
        model: "Civic",
      }),
    ).toBe(false);
  });

  it("buildOpportunityBadges marks scraper review and no MMR", () => {
    const badges = buildOpportunityBadges({
      scrapeCount: 1,
      priceChanged: false,
      mileageChanged: false,
      mileageUnknown: true,
      hasLead: false,
      hasMmr: false,
      isManualSubmission: false,
      estimateFlags: { mileage: false, style: false, mmr: false },
      candidateListingCount: null,
      scraperReview: true,
      noMmr: true,
    });
    expect(badges).toContain(SCRAPER_REVIEW_BADGE);
    expect(badges).toContain("No MMR");
    expect(badges).not.toContain("Near miss");
  });

  it("isScraperReviewOnly / matchesScraperReview cover type and badge", () => {
    expect(
      isScraperReviewOnly(sampleRow({ type: "scraper_review", badges: ["No MMR"] })),
    ).toBe(true);
    expect(
      matchesScraperReview(
        sampleRow({ type: "near_miss", badges: [SCRAPER_REVIEW_BADGE, "Near miss"] }),
      ),
    ).toBe(true);
    expect(isScraperReviewOnly(sampleRow({ type: "lead", badges: [] }))).toBe(false);
  });

  it("excludes scraper-review-only rows from production view matchers", () => {
    const reviewRow = sampleRow({
      type: "scraper_review",
      badges: [SCRAPER_REVIEW_BADGE, "No MMR"],
      assignedTo: null,
      mmrValue: null,
      spread: null,
    });
    expect(matchesNeedsAction(reviewRow, null)).toBe(false);
    expect(matchesMine(reviewRow, null, "user-1")).toBe(false);
    expect(matchesWorthALook(reviewRow)).toBe(false);
  });

  it("matchesFlaggedLeads only includes bad_lead status", () => {
    expect(matchesFlaggedLeads(sampleRow({ status: "bad_lead" }))).toBe(true);
    expect(matchesFlaggedLeads(sampleRow({ status: "new" }))).toBe(false);
    expect(matchesFlaggedLeads(sampleRow({ status: "passed" }))).toBe(false);
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

  it("sortOpportunityRows orders by received desc", () => {
    const rows = [
      sampleRow({ id: "a", receivedAt: "2026-05-20T10:00:00.000Z" }),
      sampleRow({ id: "b", receivedAt: "2026-05-22T10:00:00.000Z" }),
    ];
    sortOpportunityRows(rows, "received_desc");
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("sortOpportunityRows orders by posted desc", () => {
    const rows = [
      sampleRow({ id: "a", postedAt: "2026-05-20T10:00:00.000Z" }),
      sampleRow({ id: "b", postedAt: "2026-05-22T10:00:00.000Z" }),
      sampleRow({ id: "c", postedAt: null }),
    ];
    sortOpportunityRows(rows, "posted_desc");
    expect(rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("paginateOpportunityRows slices with total", () => {
    const rows = [sampleRow({ id: "a" }), sampleRow({ id: "b" }), sampleRow({ id: "c" })];
    const page = paginateOpportunityRows(rows, 1, 1);
    expect(page).toEqual({ items: [rows[1]], total: 3, offset: 1 });
  });
});
