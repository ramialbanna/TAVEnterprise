import type { ValuationMethod, ValuationResult } from "../types/domain";
import type { MmrResult } from "./mmr";

// Maps a Manheim-specific MmrResult into the platform-agnostic ValuationResult.
// Distribution fields beyond wholesaleAvg are null until source-specific parsing
// is implemented. KV-cached MmrResult values that predate the method field are
// handled via the confidence-based fallback.
export function fromMmrResult(result: MmrResult): ValuationResult {
  const valuationMethod: ValuationMethod =
    result.method ?? (result.confidence === "high" ? "vin" : "year_make_model");

  return {
    mmrValue:       result.mmrValue,
    wholesaleAvg:   result.mmrValue,
    wholesaleClean: null,
    wholesaleRough: null,
    retailClean:    null,
    sampleCount:    null,
    confidence:     result.confidence,
    valuationMethod,
    fetchedAt:      new Date().toISOString(),
    rawResponse:    result.rawResponse,
  };
}
