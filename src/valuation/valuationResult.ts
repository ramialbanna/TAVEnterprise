import type { ValuationMethod, ValuationResult } from "../types/domain";
import type { MmrResult } from "./mmr";
import { extractManheimDistribution } from "./manheimResponseParser";

// Maps a Manheim-specific MmrResult into the platform-agnostic ValuationResult.
// Distribution fields are extracted from rawResponse using the shared
// manheimResponseParser. KV-cached MmrResult values that predate the method
// field are handled via the confidence-based fallback.
export function fromMmrResult(result: MmrResult): ValuationResult {
  const valuationMethod: ValuationMethod =
    result.method ?? (result.confidence === "high" ? "vin" : "year_make_model");

  const dist = extractManheimDistribution(result.rawResponse);

  return {
    mmrValue:                result.mmrValue,
    wholesaleAvg:            result.mmrValue, // primary scalar is authoritative; dist.wholesaleAvg is redundant here
    wholesaleClean:          dist.wholesaleClean,
    wholesaleRough:          dist.wholesaleRough,
    retailClean:             null,            // not in Manheim VIN/YMM endpoints
    sampleCount:             dist.sampleCount,
    confidence:              result.confidence,
    valuationMethod,
    fetchedAt:               new Date().toISOString(),
    rawResponse:             result.rawResponse,
    lookupMake:              result.lookupMake,
    lookupModel:             result.lookupModel,
    lookupTrim:              result.lookupTrim,
    normalizationConfidence: result.normalizationConfidence,
  };
}
