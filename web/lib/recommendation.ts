/**
 * Heuristic acquisition recommendation derived from an MMR-vs-asking-price spread
 * and the MMR lookup's confidence band.
 *
 * v1 product knobs (Phase 3 Task 3.1):
 *   - `insufficient`  — spread is missing / non-finite (treat the lookup as no-signal).
 *   - `pass`          — spread is negative (no headroom; ask >= MMR).
 *   - `strong_buy`    — spread is at or above the headroom threshold AND the confidence
 *                       is high or medium (low-confidence MMR can't carry a strong call).
 *   - `review`        — everything else (positive spread, but either below the strong-buy
 *                       threshold or only backed by a low-confidence MMR).
 *
 * The literal threshold (`STRONG_BUY_SPREAD_USD = 3000`) is a product knob — change it
 * here (and the test) when ops decides to widen/tighten the auto-strong-buy band.
 * Pure function: no I/O, no formatting, no `Date.now()` — easy to test in isolation
 * and reuse from any page-local section.
 */

export type RecommendationConfidence = "high" | "medium" | "low";

export type RecommendationVerdict = "strong_buy" | "review" | "pass" | "insufficient";

export type RecommendationInput = {
  /** MMR value − asking price, in whole dollars. `null`/`undefined`/non-finite → `insufficient`. */
  spread: number | null | undefined;
  confidence: RecommendationConfidence;
};

/** Minimum positive spread (USD) to auto-promote to `strong_buy` (when confidence is high/medium). */
export const STRONG_BUY_SPREAD_USD = 3000;

export function recommend({ spread, confidence }: RecommendationInput): RecommendationVerdict {
  if (spread === null || spread === undefined || !Number.isFinite(spread)) {
    return "insufficient";
  }
  if (spread < 0) return "pass";
  if (spread >= STRONG_BUY_SPREAD_USD && (confidence === "high" || confidence === "medium")) {
    return "strong_buy";
  }
  return "review";
}
