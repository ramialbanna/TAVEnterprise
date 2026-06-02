import type { RegionKey, SourceName } from "../types/domain";
import type { SupabaseClient } from "./supabase";

export type DuplicateUrlResubmitMetadata = {
  listingUrl: string;
  source: SourceName;
  region: RegionKey;
  year: number;
  make: string;
  model: string;
  price: number;
};

export async function findNormalizedListingBySourceUrl(
  db: SupabaseClient,
  source: SourceName,
  listingUrl: string,
): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from("normalized_listings")
    .select("id")
    .eq("source", source)
    .eq("listing_url", listingUrl)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { id: data.id as string };
}

export async function recordDuplicateUrlResubmit(
  db: SupabaseClient,
  normalizedListingId: string,
  actorUserId: string,
  metadata: DuplicateUrlResubmitMetadata,
): Promise<void> {
  const { error } = await db.from("lead_attribution_events").insert({
    normalized_listing_id: normalizedListingId,
    actor_user_id: actorUserId,
    event_type: "duplicate_url_resubmit",
    metadata: {
      listing_url: metadata.listingUrl,
      source: metadata.source,
      region: metadata.region,
      year: metadata.year,
      make: metadata.make,
      model: metadata.model,
      price: metadata.price,
    },
  });

  if (error) throw error;
}
