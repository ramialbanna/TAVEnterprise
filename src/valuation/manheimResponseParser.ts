/**
 * Pure extractor for Manheim MMR response distribution fields.
 *
 * Derived from real Manheim API responses observed in the staging environment
 * (2026-05-07). Only field paths confirmed in actual payloads are extracted.
 * Paths not seen in production return null rather than guessing.
 *
 * Documented payload shape (items[0] or root when no items array):
 *   adjustedPricing.wholesale.average  → wholesaleAvg   (mileage-adjusted average)
 *   adjustedPricing.wholesale.above    → wholesaleClean  (above-avg condition tier)
 *   adjustedPricing.wholesale.below    → wholesaleRough  (below-avg condition tier)
 *   sampleSize                         → sampleCount     (string in API, e.g. "6")
 *
 * retailClean is always null — retail pricing is absent from the VIN and YMM
 * endpoints this system uses. Add extraction here if a retail endpoint is added.
 *
 * Used by both src/valuation/valuationResult.ts (main worker) and
 * workers/tav-intelligence-worker/src/persistence/mmrCacheRepository.ts.
 */

export interface ManheimDistribution {
  wholesaleAvg:   number | null;
  wholesaleClean: number | null;
  wholesaleRough: number | null;
  /** Always null — retail pricing not present in Manheim VIN/YMM endpoints. */
  retailClean:    null;
  sampleCount:    number | null;
}

export function extractManheimDistribution(payload: unknown): ManheimDistribution {
  const none: ManheimDistribution = {
    wholesaleAvg:   null,
    wholesaleClean: null,
    wholesaleRough: null,
    retailClean:    null,
    sampleCount:    null,
  };

  if (!payload || typeof payload !== "object") return none;
  const d = payload as Record<string, unknown>;

  // Both VIN and YMM endpoints wrap results in an `items` array. When the
  // array is empty or absent, fall back to reading directly from the root.
  const candidate =
    Array.isArray(d.items) && d.items.length > 0 ? d.items[0] : d;
  if (!candidate || typeof candidate !== "object") return none;
  const t = candidate as Record<string, unknown>;

  let wholesaleAvg:   number | null = null;
  let wholesaleClean: number | null = null;
  let wholesaleRough: number | null = null;

  if (t.adjustedPricing && typeof t.adjustedPricing === "object") {
    const ap = t.adjustedPricing as Record<string, unknown>;
    if (ap.wholesale && typeof ap.wholesale === "object") {
      const w = ap.wholesale as Record<string, unknown>;
      wholesaleAvg   = posNum(w.average);
      wholesaleClean = posNum(w.above);
      wholesaleRough = posNum(w.below);
    }
  }

  return {
    wholesaleAvg,
    wholesaleClean,
    wholesaleRough,
    retailClean: null,
    sampleCount: parseSampleSize(t.sampleSize),
  };
}

/** Accept a positive number and round it; return null for zero, negative, or non-number. */
function posNum(v: unknown): number | null {
  return typeof v === "number" && v > 0 ? Math.round(v) : null;
}

/**
 * Manheim returns sampleSize as a string (e.g. "6", "140", "0").
 * "0" is valid — it means extended coverage with no same-trim auction data.
 */
function parseSampleSize(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
