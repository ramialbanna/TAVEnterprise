import { describe, it, expect } from "vitest";
import { computeFinalScore, computeFreshnessScore, computeSourceConfidenceScore } from "../src/scoring/lead";

describe("computeFreshnessScore", () => {
  it("returns 100 for stale score 0 (brand new)", () => {
    expect(computeFreshnessScore(0)).toBe(100);
  });

  it("returns 50 for stale score 50", () => {
    expect(computeFreshnessScore(50)).toBe(50);
  });

  it("returns 0 for stale score 100 (fully stale)", () => {
    expect(computeFreshnessScore(100)).toBe(0);
  });

  it("never goes below 0", () => {
    expect(computeFreshnessScore(150)).toBe(0);
  });
});

describe("computeSourceConfidenceScore", () => {
  it("autotrader scores highest", () => {
    expect(computeSourceConfidenceScore("autotrader")).toBe(90);
  });

  it("facebook scores lower than autotrader", () => {
    expect(computeSourceConfidenceScore("facebook")).toBeLessThan(
      computeSourceConfidenceScore("autotrader"),
    );
  });

  it("offerup scores lowest", () => {
    const scores = (["facebook", "craigslist", "autotrader", "cars_com", "offerup"] as const).map(
      s => computeSourceConfidenceScore(s),
    );
    expect(computeSourceConfidenceScore("offerup")).toBe(Math.min(...scores));
  });
});

describe("computeFinalScore", () => {
  it("high components produce excellent grade", () => {
    const { finalScore, grade } = computeFinalScore({
      dealScore: 90,
      buyBoxScore: 90,
      freshnessScore: 100,
      sourceConfidenceScore: 90,
    });
    expect(finalScore).toBeGreaterThanOrEqual(85);
    expect(grade).toBe("excellent");
  });

  it("mid components produce good or fair grade", () => {
    const { grade } = computeFinalScore({
      dealScore: 55,
      buyBoxScore: 50,
      freshnessScore: 80,
      sourceConfidenceScore: 65,
    });
    expect(["good", "fair"]).toContain(grade);
  });

  it("zero components produce pass grade", () => {
    const { grade } = computeFinalScore({
      dealScore: 0,
      buyBoxScore: 0,
      freshnessScore: 0,
      sourceConfidenceScore: 0,
    });
    expect(grade).toBe("pass");
  });

  it("finalScore is within 0–100", () => {
    const { finalScore } = computeFinalScore({
      dealScore: 100,
      buyBoxScore: 100,
      freshnessScore: 100,
      sourceConfidenceScore: 100,
    });
    expect(finalScore).toBeLessThanOrEqual(100);
    expect(finalScore).toBeGreaterThanOrEqual(0);
  });

  it("deal score has highest weight (40%)", () => {
    const highDeal = computeFinalScore({ dealScore: 100, buyBoxScore: 0, freshnessScore: 0, sourceConfidenceScore: 0 });
    const highBuyBox = computeFinalScore({ dealScore: 0, buyBoxScore: 100, freshnessScore: 0, sourceConfidenceScore: 0 });
    expect(highDeal.finalScore).toBeGreaterThan(highBuyBox.finalScore);
  });
});
