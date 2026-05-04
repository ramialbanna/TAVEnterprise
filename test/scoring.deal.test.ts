import { describe, it, expect } from "vitest";
import { computeDealScore } from "../src/scoring/deal";

describe("computeDealScore", () => {
  it("returns 0 when price is absent", () => {
    expect(computeDealScore(undefined, 20000)).toBe(0);
  });

  it("returns 0 when MMR is absent", () => {
    expect(computeDealScore(18000, undefined)).toBe(0);
  });

  it("returns 0 when MMR is 0", () => {
    expect(computeDealScore(18000, 0)).toBe(0);
  });

  it("returns 100 at 70% of MMR or below", () => {
    expect(computeDealScore(14000, 20000)).toBe(100);
    expect(computeDealScore(10000, 20000)).toBe(100);
  });

  it("returns 90 at 75% of MMR", () => {
    expect(computeDealScore(15000, 20000)).toBe(90);
  });

  it("returns 80 at 80% of MMR", () => {
    expect(computeDealScore(16000, 20000)).toBe(80);
  });

  it("returns 70 at 85% of MMR", () => {
    expect(computeDealScore(17000, 20000)).toBe(70);
  });

  it("returns 25 at exactly MMR", () => {
    expect(computeDealScore(20000, 20000)).toBe(25);
  });

  it("returns 10 above MMR", () => {
    expect(computeDealScore(22000, 20000)).toBe(10);
  });
});
