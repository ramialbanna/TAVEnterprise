import type { NormalizedListingInput, NormalizedListingUpsertResult } from "../types/domain";
import type { SupabaseClient } from "./supabase";

export type NormalizedListingEntryMethod = "manual" | "scraper" | "import";

/** Stamp how a listing entered the queue (Phase 3 provenance). */
export async function setNormalizedListingEntryMethod(
  db: SupabaseClient,
  listingId: string,
  entryMethod: NormalizedListingEntryMethod,
): Promise<void> {
  const { error } = await db
    .from("normalized_listings")
    .update({ entry_method: entryMethod })
    .eq("id", listingId);
  if (error) throw error;
}

/** Item 74 — seller identity already persisted on this listing URL (empty Apify payload). */
export async function loadStoredSellersByListingUrls(
  db: SupabaseClient,
  source: string,
  listingUrls: readonly string[],
): Promise<Map<string, { listingId: string; sellerUrl: string | null; sellerName: string | null }>> {
  const out = new Map<string, { listingId: string; sellerUrl: string | null; sellerName: string | null }>();
  if (source !== "facebook" || listingUrls.length === 0) return out;

  const unique = [...new Set(listingUrls.filter(Boolean))];
  const { data, error } = await db
    .from("normalized_listings")
    .select("id, listing_url, seller_url, seller_name")
    .eq("source", source)
    .in("listing_url", unique);
  if (error) throw error;

  for (const row of (data ?? []) as Array<{
    id: string;
    listing_url: string;
    seller_url: string | null;
    seller_name: string | null;
  }>) {
    if (!row.listing_url || !row.id) continue;
    out.set(row.listing_url, {
      listingId: row.id,
      sellerUrl: row.seller_url,
      sellerName: row.seller_name,
    });
  }
  return out;
}

export async function stampNormalizedListingSeller(
  db: SupabaseClient,
  listingId: string,
  seller: { sellerUrl?: string | null; sellerName?: string | null },
): Promise<void> {
  const { error } = await db
    .from("normalized_listings")
    .update({
      seller_url: seller.sellerUrl?.trim() || null,
      seller_name: seller.sellerName?.trim() || null,
    })
    .eq("id", listingId);
  if (error) throw error;
}

export async function upsertNormalizedListing(
  db: SupabaseClient,
  listing: NormalizedListingInput,
  sourceRunId?: string | null,
  rawListingId?: string,
): Promise<NormalizedListingUpsertResult> {
  const { data, error } = await db.rpc("upsert_normalized_listing", {
    p_source: listing.source,
    p_source_run_id: sourceRunId ?? null,
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
    p_description: listing.description ?? null,
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
