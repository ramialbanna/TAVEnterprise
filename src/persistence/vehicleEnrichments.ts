import type { SupabaseClient } from "./supabase";

interface VehicleEnrichmentInput {
  vehicleCandidateId: string;
  enrichmentSource: string;
  enrichmentType: string;
  payload: Record<string, unknown>;
}

export async function writeVehicleEnrichment(
  db: SupabaseClient,
  input: VehicleEnrichmentInput,
): Promise<void> {
  const { vehicleCandidateId, enrichmentSource, enrichmentType, payload } = input;

  const { error } = await db.schema("tav").from("vehicle_enrichments").insert({
    vehicle_candidate_id: vehicleCandidateId,
    enrichment_source:    enrichmentSource,
    enrichment_type:      enrichmentType,
    payload,
  });

  if (error) throw error;
}
