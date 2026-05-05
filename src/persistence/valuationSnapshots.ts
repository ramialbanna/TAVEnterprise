import type { SupabaseClient } from "./supabase";
import type { NormalizedListingInput } from "../types/domain";
import type { MmrResult } from "../valuation/mmr";

interface ValuationSnapshotInput {
  normalizedListingId: string;
  vehicleCandidateId?: string;
  listing: Pick<NormalizedListingInput, "vin" | "year" | "make" | "model" | "mileage">;
  mmrResult: MmrResult;
}

// Confidence values in domain.ts use "high"/"medium" — the DB constraint uses "vin"/"ymm".
function mapConfidence(confidence: MmrResult["confidence"]): "vin" | "ymm" {
  return confidence === "high" ? "vin" : "ymm";
}

export async function writeValuationSnapshot(
  db: SupabaseClient,
  input: ValuationSnapshotInput,
): Promise<void> {
  const { normalizedListingId, vehicleCandidateId, listing, mmrResult } = input;

  const { error } = await db.schema("tav").from("valuation_snapshots").insert({
    normalized_listing_id: normalizedListingId,
    vehicle_candidate_id: vehicleCandidateId ?? null,
    vin: listing.vin ?? null,
    year: listing.year ?? null,
    make: listing.make ?? null,
    model: listing.model ?? null,
    mileage: listing.mileage ?? null,
    mmr_value: mmrResult.mmrValue,
    confidence: mapConfidence(mmrResult.confidence),
    fetched_at: new Date().toISOString(),
    raw_response: mmrResult.rawResponse,
  });

  if (error) throw error;
}
