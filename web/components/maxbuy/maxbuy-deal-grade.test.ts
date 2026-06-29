import { describe, expect, it } from "vitest";

import { computeMaxbuyDealGrade, dealGradeLabel } from "./maxbuy-deal-grade";

describe("computeMaxbuyDealGrade", () => {
  it("maps verdicts to base letter grades", () => {
    expect(computeMaxbuyDealGrade({ verdict: "STRONG_BUY", dataStrength: "high" })).toBe("A");
    expect(computeMaxbuyDealGrade({ verdict: "BUY", dataStrength: "medium" })).toBe("B");
    expect(computeMaxbuyDealGrade({ verdict: "REVIEW", dataStrength: "medium" })).toBe("C");
    expect(computeMaxbuyDealGrade({ verdict: "PASS", dataStrength: "medium" })).toBe("D");
  });

  it("downgrades one letter when segment data strength is low", () => {
    expect(computeMaxbuyDealGrade({ verdict: "BUY", dataStrength: "low" })).toBe("C");
    expect(computeMaxbuyDealGrade({ verdict: "PASS", dataStrength: "low" })).toBe("F");
  });

  it("uses delta to refine review and pass bands", () => {
    expect(
      computeMaxbuyDealGrade({
        verdict: "REVIEW",
        dataStrength: "medium",
        deltaToAsk: -1_341,
      }),
    ).toBe("D");
    expect(
      computeMaxbuyDealGrade({
        verdict: "PASS",
        dataStrength: "high",
        deltaToAsk: -4_000,
      }),
    ).toBe("F");
  });

  it("returns null for vehicle-fit / missing verdict", () => {
    expect(computeMaxbuyDealGrade({ verdict: null, displayState: "vehicle_fit" })).toBeNull();
    expect(computeMaxbuyDealGrade({ verdict: null, displayState: "deal_fit" })).toBeNull();
  });

  it("accepts live snapshot lowercase verdicts", () => {
    expect(computeMaxbuyDealGrade({ verdict: "strong_buy", dataStrength: "high" })).toBe("A");
  });
});

describe("dealGradeLabel", () => {
  it("provides closer-facing descriptions", () => {
    expect(dealGradeLabel("A")).toMatch(/excellent/i);
    expect(dealGradeLabel("F")).toMatch(/pass/i);
  });
});
