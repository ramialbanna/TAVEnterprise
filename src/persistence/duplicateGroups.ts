import type { SupabaseClient } from "./supabase";

export async function linkNormalizedListingToCandidate(
  db: SupabaseClient,
  vehicleCandidateId: string,
  normalizedListingId: string,
  dedupeType: "exact" | "fuzzy",
  confidence: number,
  isCanonical: boolean = false,
): Promise<void> {
  const { error } = await db
    .from("duplicate_groups")
    .upsert(
      {
        vehicle_candidate_id: vehicleCandidateId,
        normalized_listing_id: normalizedListingId,
        dedupe_type: dedupeType,
        confidence,
        is_canonical: isCanonical,
      },
      { onConflict: "vehicle_candidate_id,normalized_listing_id" },
    );

  if (error) throw error;
}
