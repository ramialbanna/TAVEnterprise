import { describe, it, expect } from "vitest";
import { buildOpportunityBadges, isReviewableNearMiss } from "../src/persistence/opportunities";

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
      hasLead: false,
      hasMmr: false,
      isManualSubmission: true,
      estimateFlags: { mileage: false, style: false, mmr: false },
      candidateListingCount: null,
    });
    expect(badges).toContain("Manual submission");
  });
});
