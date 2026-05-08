import { describe, it, expect } from "vitest";
import { matchBuyBox } from "../src/scoring/buyBox";
import type { BuyBoxRule, NormalizedListingInput } from "../src/types/domain";

const baseRule: BuyBoxRule = {
  id: "uuid-1",
  ruleId: "bbr-test",
  version: 1,
  make: null,
  model: null,
  yearMin: 2018,
  yearMax: 2023,
  maxMileage: 100000,
  minMileage: null,
  targetPricePctOfMmr: 85,
  regions: ["dallas_tx"],
  sources: ["facebook"],
  priorityScore: 50,
  isActive: true,
};

const baseListing: NormalizedListingInput = {
  source: "facebook",
  url: "https://fb.com/1",
  title: "2019 Toyota Camry SE 62k miles $18500",
  year: 2019,
  make: "toyota",
  model: "camry",
  price: 18500,
  mileage: 62000,
  region: "dallas_tx",
  scrapedAt: new Date().toISOString(),
};

describe("matchBuyBox", () => {
  it("returns null when rules array is empty", () => {
    expect(matchBuyBox(baseListing, [])).toBeNull();
  });

  it("matches a valid listing against a rule", () => {
    const result = matchBuyBox(baseListing, [baseRule]);
    expect(result).not.toBeNull();
    expect(result?.ruleId).toBe("bbr-test");
  });

  it("rejects listing with year below yearMin", () => {
    expect(matchBuyBox({ ...baseListing, year: 2015 }, [baseRule])).toBeNull();
  });

  it("rejects listing with year above yearMax", () => {
    expect(matchBuyBox({ ...baseListing, year: 2025 }, [baseRule])).toBeNull();
  });

  it("rejects listing with mileage above maxMileage", () => {
    expect(matchBuyBox({ ...baseListing, mileage: 110000 }, [baseRule])).toBeNull();
  });

  it("rejects listing not in allowed regions", () => {
    expect(matchBuyBox({ ...baseListing, region: "houston_tx" }, [baseRule])).toBeNull();
  });

  it("rejects listing not in allowed sources", () => {
    expect(matchBuyBox({ ...baseListing, source: "craigslist" }, [baseRule])).toBeNull();
  });

  it("rejects listing whose make does not match rule make filter", () => {
    const ruleWithMake = { ...baseRule, make: "ford,chevrolet" };
    expect(matchBuyBox(baseListing, [ruleWithMake])).toBeNull();
  });

  it("matches when make filter includes listing make", () => {
    const ruleWithMake = { ...baseRule, make: "toyota,honda" };
    expect(matchBuyBox(baseListing, [ruleWithMake])).not.toBeNull();
  });

  it("inactive rules are ignored", () => {
    expect(matchBuyBox(baseListing, [{ ...baseRule, isActive: false }])).toBeNull();
  });

  it("returns highest-priority matching rule", () => {
    const low = { ...baseRule, ruleId: "low-priority", priorityScore: 10 };
    const high = { ...baseRule, ruleId: "high-priority", priorityScore: 90, id: "uuid-2" };
    const result = matchBuyBox(baseListing, [low, high]);
    expect(result?.ruleId).toBe("high-priority");
  });

  it("score is higher when price is well below targetPricePctOfMmr", () => {
    const withMmr = matchBuyBox(baseListing, [baseRule], 30000); // 62% of MMR
    const withoutMmr = matchBuyBox(baseListing, [baseRule]);
    expect((withMmr?.score ?? 0)).toBeGreaterThan((withoutMmr?.score ?? 0));
  });
});
