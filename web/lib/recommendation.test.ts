import { describe, expect, it } from "vitest";

import { recommend, STRONG_BUY_SPREAD_USD } from "./recommendation";

/**
 * `recommend()` thresholds are product knobs, intentionally locked here:
 *
 *   - `strong_buy`   — spread ≥ $3,000 headroom AND confidence ∈ {high, medium}
 *   - `pass`         — spread < $0 headroom (ask >= MMR)
 *   - `review`       — every other valid spread (positive but below the strong-buy
 *                      threshold, OR ≥ threshold but only low-confidence MMR)
 *   - `insufficient` — spread missing / non-finite (no-signal lookup)
 *
 * Changing a threshold means updating this file AND the exported constant in
 * `recommendation.ts`. Drift between the two is a regression.
 */
describe("recommend()", () => {
  it("locks STRONG_BUY_SPREAD_USD to $3,000 (changing the knob requires updating this test)", () => {
    expect(STRONG_BUY_SPREAD_USD).toBe(3000);
  });

  it("returns strong_buy for spread $5,000 with high confidence", () => {
    expect(recommend({ spread: 5000, confidence: "high" })).toBe("strong_buy");
  });

  it("returns strong_buy for spread $5,000 with medium confidence", () => {
    expect(recommend({ spread: 5000, confidence: "medium" })).toBe("strong_buy");
  });

  it("returns review for spread $5,000 with low confidence — low confidence cannot carry strong_buy", () => {
    expect(recommend({ spread: 5000, confidence: "low" })).toBe("review");
  });

  it("returns review for spread $500 with low confidence (positive but below strong_buy threshold)", () => {
    expect(recommend({ spread: 500, confidence: "low" })).toBe("review");
  });

  it("returns review for spread $500 with high confidence (positive but below strong_buy threshold)", () => {
    expect(recommend({ spread: 500, confidence: "high" })).toBe("review");
  });

  it("returns pass for spread -$2,000 (negative headroom) — confidence is irrelevant", () => {
    expect(recommend({ spread: -2000, confidence: "high" })).toBe("pass");
    expect(recommend({ spread: -2000, confidence: "medium" })).toBe("pass");
    expect(recommend({ spread: -2000, confidence: "low" })).toBe("pass");
  });

  it("returns insufficient when spread is undefined", () => {
    expect(recommend({ spread: undefined, confidence: "high" })).toBe("insufficient");
  });

  it("returns insufficient when spread is null", () => {
    expect(recommend({ spread: null, confidence: "high" })).toBe("insufficient");
  });

  it("returns insufficient when spread is NaN or non-finite", () => {
    expect(recommend({ spread: Number.NaN, confidence: "high" })).toBe("insufficient");
    expect(recommend({ spread: Number.POSITIVE_INFINITY, confidence: "high" })).toBe("insufficient");
    expect(recommend({ spread: Number.NEGATIVE_INFINITY, confidence: "high" })).toBe("insufficient");
  });

  it("treats spread exactly at the strong_buy threshold ($3,000) as strong_buy when confidence is high/medium", () => {
    expect(recommend({ spread: STRONG_BUY_SPREAD_USD, confidence: "high" })).toBe("strong_buy");
    expect(recommend({ spread: STRONG_BUY_SPREAD_USD, confidence: "medium" })).toBe("strong_buy");
    expect(recommend({ spread: STRONG_BUY_SPREAD_USD, confidence: "low" })).toBe("review");
  });

  it("treats spread exactly at $0 as review (not pass)", () => {
    expect(recommend({ spread: 0, confidence: "high" })).toBe("review");
    expect(recommend({ spread: 0, confidence: "low" })).toBe("review");
  });
});
