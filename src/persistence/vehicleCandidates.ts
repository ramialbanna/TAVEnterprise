import type { NormalizedListingInput } from "../types/domain";
import type { SupabaseClient } from "./supabase";

export interface VehicleCandidateRecord {
  id: string;
  isNew: boolean;
}

export async function upsertVehicleCandidate(
  db: SupabaseClient,
  identityKey: string,
  listing: NormalizedListingInput,
): Promise<VehicleCandidateRecord> {
  const { data: existing, error: selectErr } = await db
    .from("vehicle_candidates")
    .select("id, listing_count")
    .eq("identity_key", identityKey)
    .maybeSingle();

  if (selectErr) throw selectErr;

  if (existing) {
    const { error: updateErr } = await db
      .from("vehicle_candidates")
      .update({ last_seen_at: listing.scrapedAt, listing_count: (existing.listing_count as number) + 1 })
      .eq("id", existing.id);
    if (updateErr) throw updateErr;
    return { id: existing.id as string, isNew: false };
  }

  const { data: inserted, error: insertErr } = await db
    .from("vehicle_candidates")
    .insert({
      identity_key: identityKey,
      year: listing.year ?? null,
      make: listing.make ?? null,
      model: listing.model ?? null,
      trim: listing.trim ?? null,
      region: listing.region ?? null,
      listing_count: 1,
      first_seen_at: listing.scrapedAt,
      last_seen_at: listing.scrapedAt,
    })
    .select("id")
    .single();

  if (insertErr) {
    // Race condition: another concurrent request inserted first
    if ((insertErr as unknown as Record<string, unknown>)["code"] === "23505") {
      const { data: retry, error: retryErr } = await db
        .from("vehicle_candidates")
        .select("id")
        .eq("identity_key", identityKey)
        .single();
      if (retryErr) throw retryErr;
      if (!retry) throw new Error("upsertVehicleCandidate: concurrent insert race unresolved");
      return { id: retry.id as string, isNew: false };
    }
    throw insertErr;
  }

  if (!inserted) throw new Error("upsertVehicleCandidate: no row returned");
  return { id: inserted.id as string, isNew: true };
}
