import { describe, it, expect } from "vitest";
import { computeFinalScore, computeFreshnessScore, computeRegionScore, computeSourceConfidenceScore } from "../src/scoring/lead";

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

describe("computeRegionScore", () => {
  it("dallas_tx (primary market) → 100", () => {
    expect(computeRegionScore("dallas_tx")).toBe(100);
  });

  it("houston_tx (primary market) → 100", () => {
    expect(computeRegionScore("houston_tx")).toBe(100);
  });

  it("austin_tx (secondary market) → 75", () => {
    expect(computeRegionScore("austin_tx")).toBe(75);
  });

  it("san_antonio_tx (secondary market) → 75", () => {
    expect(computeRegionScore("san_antonio_tx")).toBe(75);
  });

  it("undefined (out-of-region) → 50", () => {
    expect(computeRegionScore(undefined)).toBe(50);
  });

  it("unknown region string → 50", () => {
    expect(computeRegionScore("miami_fl")).toBe(50);
  });
});

describe("computeFinalScore", () => {
  it("high components produce excellent grade", () => {
    const { finalScore, grade } = computeFinalScore({
      dealScore: 90,
      buyBoxScore: 90,
      freshnessScore: 100,
      regionScore: 90,
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
      regionScore: 75,
      sourceConfidenceScore: 65,
    });
    expect(["good", "fair"]).toContain(grade);
  });

  it("zero components produce pass grade", () => {
    const { grade } = computeFinalScore({
      dealScore: 0,
      buyBoxScore: 0,
      freshnessScore: 0,
      regionScore: 0,
      sourceConfidenceScore: 0,
    });
    expect(grade).toBe("pass");
  });

  it("finalScore is within 0–100", () => {
    const { finalScore } = computeFinalScore({
      dealScore: 100,
      buyBoxScore: 100,
      freshnessScore: 100,
      regionScore: 100,
      sourceConfidenceScore: 100,
    });
    expect(finalScore).toBeLessThanOrEqual(100);
    expect(finalScore).toBeGreaterThanOrEqual(0);
  });

  it("deal score has highest weight (35%)", () => {
    const highDeal = computeFinalScore({ dealScore: 100, buyBoxScore: 0, freshnessScore: 0, regionScore: 0, sourceConfidenceScore: 0 });
    const highBuyBox = computeFinalScore({ dealScore: 0, buyBoxScore: 100, freshnessScore: 0, regionScore: 0, sourceConfidenceScore: 0 });
    expect(highDeal.finalScore).toBeGreaterThan(highBuyBox.finalScore);
  });

  it("primary-region listing scores higher than out-of-region", () => {
    const inRegion = computeFinalScore({ dealScore: 80, buyBoxScore: 80, freshnessScore: 80, regionScore: 100, sourceConfidenceScore: 80 });
    const outRegion = computeFinalScore({ dealScore: 80, buyBoxScore: 80, freshnessScore: 80, regionScore: 50, sourceConfidenceScore: 80 });
    expect(inRegion.finalScore).toBeGreaterThan(outRegion.finalScore);
  });

  it("finalScore difference reflects 10% regionScore weight", () => {
    const high = computeFinalScore({ dealScore: 80, buyBoxScore: 80, freshnessScore: 80, regionScore: 100, sourceConfidenceScore: 80 });
    const low  = computeFinalScore({ dealScore: 80, buyBoxScore: 80, freshnessScore: 80, regionScore: 50,  sourceConfidenceScore: 80 });
    // region weight is 10%; score gap is 50 points → expected diff = round(50 * 0.10) = 5
    expect(high.finalScore - low.finalScore).toBe(Math.round((100 - 50) * 0.10));
  });

  it("secondary-region listing scores between primary and out-of-region", () => {
    const primary   = computeFinalScore({ dealScore: 70, buyBoxScore: 70, freshnessScore: 70, regionScore: 100, sourceConfidenceScore: 70 });
    const secondary = computeFinalScore({ dealScore: 70, buyBoxScore: 70, freshnessScore: 70, regionScore: 75,  sourceConfidenceScore: 70 });
    const unknown   = computeFinalScore({ dealScore: 70, buyBoxScore: 70, freshnessScore: 70, regionScore: 50,  sourceConfidenceScore: 70 });
    expect(primary.finalScore).toBeGreaterThan(secondary.finalScore);
    expect(secondary.finalScore).toBeGreaterThan(unknown.finalScore);
  });
});
