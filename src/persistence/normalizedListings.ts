import type { NormalizedListingInput } from "../types/domain";
import type { SupabaseClient } from "./supabase";

export async function upsertNormalizedListing(
  db: SupabaseClient,
  listing: NormalizedListingInput,
  sourceRunId: string,
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("normalized_listings")
    .upsert(
      {
        source: listing.source,
        source_run_id: sourceRunId,
        listing_url: listing.url,
        source_listing_id: listing.sourceListingId ?? null,
        title: listing.title,
        price: listing.price ?? null,
        mileage: listing.mileage ?? null,
        year: listing.year ?? null,
        make: listing.make ?? null,
        model: listing.model ?? null,
        trim: listing.trim ?? null,
        vin: listing.vin ?? null,
        region: listing.region ?? null,
        scraped_at: listing.scrapedAt,
        last_seen_at: listing.scrapedAt,
      },
      { onConflict: "source,listing_url" },
    )
    .select("id")
    .single();

  if (error) throw error;
  if (!data) throw new Error("upsertNormalizedListing: no row returned");

  return { id: data.id as string };
}
