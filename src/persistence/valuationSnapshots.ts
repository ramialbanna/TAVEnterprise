import type { SupabaseClient } from "./supabase";
import type { NormalizedListingInput, ValuationResult } from "../types/domain";

interface ValuationSnapshotInput {
  normalizedListingId: string;
  vehicleCandidateId?: string;
  listing: Pick<NormalizedListingInput, "vin" | "year" | "make" | "model" | "mileage">;
  valuation: ValuationResult;
}

export async function writeValuationSnapshot(
  db: SupabaseClient,
  input: ValuationSnapshotInput,
): Promise<void> {
  const { normalizedListingId, vehicleCandidateId, listing, valuation } = input;

  const { error } = await db.schema("tav").from("valuation_snapshots").insert({
    normalized_listing_id:    normalizedListingId,
    vehicle_candidate_id:     vehicleCandidateId ?? null,
    vin:                      listing.vin ?? null,
    year:                     listing.year ?? null,
    make:                     listing.make ?? null,
    model:                    listing.model ?? null,
    mileage:                  listing.mileage ?? null,
    mmr_value:                valuation.mmrValue,
    confidence:               valuation.confidence,
    valuation_method:         valuation.valuationMethod,
    mmr_wholesale_avg:        valuation.wholesaleAvg,
    mmr_wholesale_clean:      valuation.wholesaleClean,
    mmr_wholesale_rough:      valuation.wholesaleRough,
    mmr_retail_clean:         valuation.retailClean,
    mmr_sample_count:         valuation.sampleCount,
    fetched_at:               valuation.fetchedAt,
    raw_response:             valuation.rawResponse,
    lookup_make:              valuation.lookupMake ?? null,
    lookup_model:             valuation.lookupModel ?? null,
    lookup_trim:              valuation.lookupTrim ?? null,
    normalization_confidence: valuation.normalizationConfidence ?? null,
  });

  if (error) throw error;
}
