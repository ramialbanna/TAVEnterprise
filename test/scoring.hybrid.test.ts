import { describe, it, expect } from "vitest";
import { computeHybridBuyBoxScore } from "../src/scoring/hybrid";

describe("computeHybridBuyBoxScore", () => {
  it("returns 50 when all three components are 50", () => {
    expect(computeHybridBuyBoxScore(50, 50, 50)).toBe(50);
  });

  it("rule dominance: ruleScore=100, others=0 → 60", () => {
    expect(computeHybridBuyBoxScore(100, 0, 0)).toBe(60);
  });

  it("segment dominance: segmentProfitScore=100, others=0 → 25", () => {
    expect(computeHybridBuyBoxScore(0, 100, 0)).toBe(25);
  });

  it("demand dominance: regionDemandScore=100, others=0 → 15", () => {
    expect(computeHybridBuyBoxScore(0, 0, 100)).toBe(15);
  });

  it("weights sum to 1.0: max inputs produce 100", () => {
    expect(computeHybridBuyBoxScore(100, 100, 100)).toBe(100);
  });

  it("min inputs produce 0", () => {
    expect(computeHybridBuyBoxScore(0, 0, 0)).toBe(0);
  });

  it("result is a whole number (no decimals)", () => {
    const score = computeHybridBuyBoxScore(70, 60, 80);
    expect(Number.isInteger(score)).toBe(true);
  });

  it("rounds correctly: 70*0.60 + 60*0.25 + 80*0.15 = 42+15+12 = 69", () => {
    expect(computeHybridBuyBoxScore(70, 60, 80)).toBe(69);
  });

  it("rounds a fractional result — 33*0.60 + 33*0.25 + 33*0.15 rounds to 33", () => {
    // 33*0.60=19.8, 33*0.25=8.25, 33*0.15=4.95 → sum=33.00 → 33
    expect(computeHybridBuyBoxScore(33, 33, 33)).toBe(33);
  });
});
