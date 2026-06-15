/**
 * Pure extractor for Manheim/Cox MMR response distribution fields.
 *
 * Documented payload shape (bestMatch item, else items[0], else root):
 *   wholesale.average                    → wholesaleBaseAvg   (base MMR)
 *   adjustedPricing.wholesale.average    → wholesaleAvg       (adjusted MMR)
 *   adjustedPricing.wholesale.above      → wholesaleClean
 *   adjustedPricing.wholesale.below      → wholesaleRough
 *   adjustedPricing.retail.*             → retail tiers
 *   sampleSize                           → sampleCount
 *
 * Cox MMR 1.4 returns retail tiers when the request includes `retail` in the
 * include list (`MANHEIM_INCLUDE_RETAIL=true`); otherwise the retail object is
 * absent and the retail fields parse to null. The legacy Manheim VIN/YMM
 * endpoints did not return retail and produced null on every call.
 *
 * Used by both src/valuation/valuationResult.ts (main worker) and
 * workers/tav-intelligence-worker/src/persistence/mmrCacheRepository.ts.
 */

import { selectMmrPayloadItem } from "./manheimPayloadItem";

export interface ManheimDistribution {
  /** Adjusted wholesale average (build options, etc.). */
  wholesaleAvg:   number | null;
  wholesaleClean: number | null;
  wholesaleRough: number | null;
  /** Base wholesale average before option adjustments. */
  wholesaleBaseAvg:   number | null;
  wholesaleBaseClean: number | null;
  wholesaleBaseRough: number | null;
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
    wholesaleBaseAvg:   null,
    wholesaleBaseClean: null,
    wholesaleBaseRough: null,
    retailClean:    null,
    retailAvg:      null,
    retailRough:    null,
    sampleCount:    null,
  };

  if (!payload || typeof payload !== "object") return none;

  const t = selectMmrPayloadItem(payload);
  if (t === null) return none;

  let wholesaleAvg:   number | null = null;
  let wholesaleClean: number | null = null;
  let wholesaleRough: number | null = null;
  let wholesaleBaseAvg:   number | null = null;
  let wholesaleBaseClean: number | null = null;
  let wholesaleBaseRough: number | null = null;
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

  if (t.wholesale && typeof t.wholesale === "object") {
    const w = t.wholesale as Record<string, unknown>;
    wholesaleBaseAvg   = posNum(w.average);
    wholesaleBaseClean = posNum(w.above);
    wholesaleBaseRough = posNum(w.below);
  }

  return {
    wholesaleAvg,
    wholesaleClean,
    wholesaleRough,
    wholesaleBaseAvg,
    wholesaleBaseClean,
    wholesaleBaseRough,
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

/**
 * Primary MMR scalar for cache/envelope — adjusted wholesale from the selected item.
 */
export function extractMmrAdjustedValue(payload: unknown): number | null {
  const t = selectMmrPayloadItem(payload);
  if (t === null) return null;

  if (t.adjustedPricing && typeof t.adjustedPricing === "object") {
    const ap = t.adjustedPricing as Record<string, unknown>;
    if (ap.wholesale && typeof ap.wholesale === "object") {
      const avg = posNum((ap.wholesale as Record<string, unknown>).average);
      if (avg !== null) return avg;
    }
  }

  for (const key of [
    "adjustedWholesaleAverage",
    "wholesaleMileageAdjusted",
    "wholesaleAverage",
    "mmrValue",
    "average",
    "value",
  ]) {
    const v = t[key];
    if (typeof v === "number" && v > 0) return Math.round(v);
  }

  if (t.wholesale && typeof t.wholesale === "object") {
    const avg = posNum((t.wholesale as Record<string, unknown>).average);
    if (avg !== null) return avg;
  }

  return null;
}
