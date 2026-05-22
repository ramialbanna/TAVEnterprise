import { describe, it, expect } from "vitest";
import { buildOpportunityBadges } from "../src/persistence/opportunities";

describe("buildOpportunityBadges", () => {
  it("marks first sighting and near miss", () => {
    const badges = buildOpportunityBadges({
      scrapeCount: 1,
      priceChanged: false,
      mileageChanged: false,
      hasLead: false,
      hasMmr: true,
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
});
