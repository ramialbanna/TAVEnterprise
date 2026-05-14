import type { SupabaseClient } from "./supabase";
import type {
  NormalizedListingInput,
  ValuationResult,
  ValuationMethod,
  NormalizationConfidence,
} from "../types/domain";
import type { MmrMissReason } from "../valuation/workerClient";

interface ValuationSnapshotInput {
  normalizedListingId: string;
  vehicleCandidateId?: string;
  listing: Pick<NormalizedListingInput, "vin" | "year" | "make" | "model" | "mileage">;
  valuation: ValuationResult;
}

export interface ValuationMissSnapshotInput {
  normalizedListingId: string;
  vehicleCandidateId?: string;
  listing: Pick<NormalizedListingInput, "vin" | "year" | "make" | "model" | "mileage">;
  missingReason: MmrMissReason;
  /** Lookup path that was attempted, or null when no path was selected. */
  method: ValuationMethod | null;
  normalizationConfidence?: NormalizationConfidence;
  lookupMake?: string | null;
  lookupModel?: string | null;
  lookupTrim?: string | null;
  fetchedAt?: string;
}

/**
 * Persist a row recording that an MMR lookup attempt produced no value, with
 * a structured `missing_reason` so dashboards and triage can distinguish
 * mileage_missing / trim_missing / cox_no_data / cox_unavailable etc.
 *
 * Pairs with migration 0043:
 *   - mmr_value is NULL on miss rows
 *   - missing_reason is NOT NULL on miss rows
 *   - row-level CHECK enforces hit XOR miss
 *
 * Distribution columns and rich raw_response stay NULL on miss rows; the
 * shape mirrors writeValuationSnapshot so a single SELECT can union both
 * sides.
 */
export async function writeValuationMissSnapshot(
  db: SupabaseClient,
  input: ValuationMissSnapshotInput,
): Promise<void> {
  const {
    normalizedListingId,
    vehicleCandidateId,
    listing,
    missingReason,
    method,
    normalizationConfidence,
    lookupMake,
    lookupModel,
    lookupTrim,
    fetchedAt,
  } = input;

  const { error } = await db.schema("tav").from("valuation_snapshots").insert({
    normalized_listing_id:    normalizedListingId,
    vehicle_candidate_id:     vehicleCandidateId ?? null,
    vin:                      listing.vin ?? null,
    year:                     listing.year ?? null,
    make:                     listing.make ?? null,
    model:                    listing.model ?? null,
    mileage:                  listing.mileage ?? null,
    mmr_value:                null,
    confidence:               "none",
    valuation_method:         method ?? "year_make_model",
    missing_reason:           missingReason,
    mmr_wholesale_avg:        null,
    mmr_wholesale_clean:      null,
    mmr_wholesale_rough:      null,
    mmr_retail_clean:         null,
    mmr_sample_count:         null,
    fetched_at:               fetchedAt ?? new Date().toISOString(),
    raw_response:             null,
    lookup_make:              lookupMake ?? null,
    lookup_model:             lookupModel ?? null,
    lookup_trim:              lookupTrim ?? null,
    normalization_confidence: normalizationConfidence ?? null,
  });

  if (error) throw error;
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
