import { describe, it, expect } from "vitest";
import { computeSegmentProfitScore } from "../src/scoring/segment";

describe("computeSegmentProfitScore", () => {
  it("returns 50 (neutral) when value is null", () => {
    expect(computeSegmentProfitScore(null)).toBe(50);
  });

  it("returns 50 (neutral) when value is undefined", () => {
    expect(computeSegmentProfitScore(undefined)).toBe(50);
  });

  it("returns 100 at exactly 20% margin", () => {
    expect(computeSegmentProfitScore(20)).toBe(100);
  });

  it("returns 100 above 20% margin", () => {
    expect(computeSegmentProfitScore(35)).toBe(100);
  });

  it("returns 85 at exactly 15% margin", () => {
    expect(computeSegmentProfitScore(15)).toBe(85);
  });

  it("returns 85 between 15% and 20%", () => {
    expect(computeSegmentProfitScore(17)).toBe(85);
  });

  it("returns 70 at exactly 10% margin", () => {
    expect(computeSegmentProfitScore(10)).toBe(70);
  });

  it("returns 70 between 10% and 15%", () => {
    expect(computeSegmentProfitScore(12)).toBe(70);
  });

  it("returns 55 at exactly 5% margin", () => {
    expect(computeSegmentProfitScore(5)).toBe(55);
  });

  it("returns 55 between 5% and 10%", () => {
    expect(computeSegmentProfitScore(7)).toBe(55);
  });

  it("returns 40 at exactly 0% margin", () => {
    expect(computeSegmentProfitScore(0)).toBe(40);
  });

  it("returns 40 between 0% and 5%", () => {
    expect(computeSegmentProfitScore(2.5)).toBe(40);
  });

  it("returns 10 for negative margin", () => {
    expect(computeSegmentProfitScore(-5)).toBe(10);
  });

  it("returns 10 for deeply negative margin", () => {
    expect(computeSegmentProfitScore(-50)).toBe(10);
  });
});
