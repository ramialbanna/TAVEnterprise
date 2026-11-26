import type { SupabaseClient } from "./supabase";
import type { SellerClassification, SellerType } from "../ingest/dealerHeuristics";

const URL_CHUNK = 100;

const SELLER_TYPES = new Set<SellerType>([
  "dealer",
  "private_party",
  "curbstoner_suspected",
  "unknown",
]);

function isSellerType(value: string): value is SellerType {
  return SELLER_TYPES.has(value as SellerType);
}

/** Prior Haiku seller calls, keyed by listing URL. */
export async function loadSellerClassifyCache(
  db: SupabaseClient,
  source: string,
  listingUrls: readonly string[],
): Promise<Map<string, SellerClassification>> {
  const out = new Map<string, SellerClassification>();
  const unique = [...new Set(listingUrls.filter(Boolean))];
  for (let i = 0; i < unique.length; i += URL_CHUNK) {
    const chunk = unique.slice(i, i + URL_CHUNK);
    const { data, error } = await db
      .from("seller_classify_cache")
      .select("listing_url, seller_type, confidence, signals, reasoning")
      .eq("source", source)
      .in("listing_url", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{
      listing_url: string;
      seller_type: string;
      confidence: number | string;
      signals: string[] | null;
      reasoning: string | null;
    }>) {
      if (!row.listing_url || !isSellerType(row.seller_type)) continue;
      out.set(row.listing_url, {
        sellerType: row.seller_type,
        confidence: Number(row.confidence),
        reasoning: row.reasoning ?? "Reused the stored seller classification.",
        signals: Array.isArray(row.signals) ? row.signals : [],
        source: "cache",
      });
    }
  }
  return out;
}

export async function saveSellerClassifyCache(
  db: SupabaseClient,
  input: { source: string; listingUrl: string; classification: SellerClassification },
): Promise<void> {
  const listingUrl = input.listingUrl.trim();
  if (!listingUrl) return;
  const { error } = await db.from("seller_classify_cache").upsert(
    {
      source: input.source,
      listing_url: listingUrl,
      seller_type: input.classification.sellerType,
      confidence: input.classification.confidence,
      signals: input.classification.signals,
      reasoning: input.classification.reasoning,
      classified_at: new Date().toISOString(),
    },
    { onConflict: "source,listing_url" },
  );
  if (error) throw error;
}
