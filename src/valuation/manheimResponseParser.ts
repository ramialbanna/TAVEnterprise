/**
 * Pure extractor for Manheim/Cox MMR response distribution fields.
 *
 * Documented payload shape (items[0] or root when no items array):
 *   adjustedPricing.wholesale.average  → wholesaleAvg   (mileage-adjusted average)
 *   adjustedPricing.wholesale.above    → wholesaleClean  (above-avg condition tier)
 *   adjustedPricing.wholesale.below    → wholesaleRough  (below-avg condition tier)
 *   adjustedPricing.retail.average     → retailAvg
 *   adjustedPricing.retail.above       → retailClean
 *   adjustedPricing.retail.below       → retailRough
 *   sampleSize                         → sampleCount     (string in API, e.g. "6")
 *
 * Cox MMR 1.4 returns retail tiers when the request includes `retail` in the
 * include list (`MANHEIM_INCLUDE_RETAIL=true`); otherwise the retail object is
 * absent and the retail fields parse to null. The legacy Manheim VIN/YMM
 * endpoints did not return retail and produced null on every call.
 *
 * Used by both src/valuation/valuationResult.ts (main worker) and
 * workers/tav-intelligence-worker/src/persistence/mmrCacheRepository.ts.
 */

export interface ManheimDistribution {
  wholesaleAvg:   number | null;
  wholesaleClean: number | null;
  wholesaleRough: number | null;
  /** Cox MMR 1.4 retail tier above. Null when retail include flag is off or absent from payload. */
  retailClean:    number | null;
  /** Cox MMR 1.4 retail tier average. Null when retail include flag is off or absent from payload. */
  retailAvg:      number | null;
  /** Cox MMR 1.4 retail tier below. Null when retail include flag is off or absent from payload. */
  retailRough:    number | null;
  sampleCount:    number | null;
}

export function extractManheimDistribution(payload: unknown): ManheimDistribution {
  const none: ManheimDistribution = {
    wholesaleAvg:   null,
    wholesaleClean: null,
    wholesaleRough: null,
    retailClean:    null,
    retailAvg:      null,
    retailRough:    null,
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
  let retailClean:    number | null = null;
  let retailAvg:      number | null = null;
  let retailRough:    number | null = null;

  if (t.adjustedPricing && typeof t.adjustedPricing === "object") {
    const ap = t.adjustedPricing as Record<string, unknown>;
    if (ap.wholesale && typeof ap.wholesale === "object") {
      const w = ap.wholesale as Record<string, unknown>;
      wholesaleAvg   = posNum(w.average);
      wholesaleClean = posNum(w.above);
      wholesaleRough = posNum(w.below);
    }
    if (ap.retail && typeof ap.retail === "object") {
      const r = ap.retail as Record<string, unknown>;
      retailAvg   = posNum(r.average);
      retailClean = posNum(r.above);
      retailRough = posNum(r.below);
    }
  }

  return {
    wholesaleAvg,
    wholesaleClean,
    wholesaleRough,
    retailClean,
    retailAvg,
    retailRough,
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
