import { describe, it, expect } from "vitest";
import { computeRegionDemandScore } from "../src/scoring/demand";

describe("computeRegionDemandScore", () => {
  it("returns 50 (neutral) when value is null", () => {
    expect(computeRegionDemandScore(null)).toBe(50);
  });

  it("returns 50 (neutral) when value is undefined", () => {
    expect(computeRegionDemandScore(undefined)).toBe(50);
  });

  it("returns 0 when demand score is 0", () => {
    expect(computeRegionDemandScore(0)).toBe(0);
  });

  it("returns 100 when demand score is 100", () => {
    expect(computeRegionDemandScore(100)).toBe(100);
  });

  it("clamps negative values to 0", () => {
    expect(computeRegionDemandScore(-10)).toBe(0);
  });

  it("clamps values above 100 to 100", () => {
    expect(computeRegionDemandScore(150)).toBe(100);
  });

  it("passes through a typical mid-range value", () => {
    expect(computeRegionDemandScore(72)).toBe(72);
  });
});
