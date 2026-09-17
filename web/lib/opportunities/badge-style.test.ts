import { describe, expect, it } from "vitest";

import {
  badgeTone,
  isKilledOpportunityBadge,
  isMetaBadge,
  visibleOpportunityBadges,
} from "./badge-style";

describe("killed opportunity badges (§76)", () => {
  it("strips Estimated YMMS, Estimated MMR, and Possible duplicate", () => {
    expect(
      visibleOpportunityBadges([
        "First seen",
        "Estimated YMMS",
        "Estimated MMR",
        "Possible duplicate",
        "Seller unchecked",
        "Mileage unknown",
      ]),
    ).toEqual(["First seen", "Seller unchecked", "Mileage unknown"]);
  });

  it("keeps Estimated miles", () => {
    expect(isKilledOpportunityBadge("Estimated miles")).toBe(false);
    expect(visibleOpportunityBadges(["Estimated miles"])).toEqual(["Estimated miles"]);
  });
});

describe("badgeTone", () => {
  it("marks Seller unchecked as review", () => {
    expect(badgeTone("Seller unchecked")).toBe("review");
  });
});

describe("isMetaBadge", () => {
  it("does not treat Seller unchecked as a muted meta chip", () => {
    expect(isMetaBadge("Seller unchecked")).toBe(false);
  });
});
