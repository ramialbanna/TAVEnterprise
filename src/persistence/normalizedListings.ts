import type { NormalizedListingInput, NormalizedListingUpsertResult } from "../types/domain";
import type { SupabaseClient } from "./supabase";

export async function upsertNormalizedListing(
  db: SupabaseClient,
  listing: NormalizedListingInput,
  sourceRunId: string,
  rawListingId?: string,
): Promise<NormalizedListingUpsertResult> {
  const { data, error } = await db.rpc("upsert_normalized_listing", {
    p_source: listing.source,
    p_source_run_id: sourceRunId,
    p_listing_url: listing.url,
    p_source_listing_id: listing.sourceListingId ?? null,
    p_title: listing.title,
    p_price: listing.price ?? null,
    p_mileage: listing.mileage ?? null,
    p_year: listing.year ?? null,
    p_make: listing.make ?? null,
    p_model: listing.model ?? null,
    p_trim: listing.trim ?? null,
    p_vin: listing.vin ?? null,
    p_region: listing.region ?? null,
    p_scraped_at: listing.scrapedAt,
    p_seller_name: listing.sellerName ?? null,
    p_seller_url: listing.sellerUrl ?? null,
    p_images: listing.images ?? null,
    p_posted_at: listing.postedAt ?? null,
    p_raw_listing_id: rawListingId ?? null,
  });

  if (error) throw error;

  type RpcRow = { listing_id: string; is_new: boolean; price_changed: boolean; mileage_changed: boolean };
  const rows = data as RpcRow[] | null;
  const row = rows?.[0];
  if (!row) throw new Error("upsertNormalizedListing: no row returned from RPC");

  return {
    id: row.listing_id,
    isNew: row.is_new,
    priceChanged: row.price_changed,
    mileageChanged: row.mileage_changed,
  };
}
