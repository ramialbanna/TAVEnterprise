import type { SupabaseClient } from "./supabase";

/** Item 69 — v1 scope: Dallas Facebook only. */
export const BLOCKED_SELLER_V1_SOURCE = "facebook" as const;
export const BLOCKED_SELLER_V1_REGION = "dallas_tx" as const;

export type BlockedSellerReason = "dealer";

export interface BlockedSellerLookup {
  keys: Set<string>;
}

export interface UpsertBlockedSellerInput {
  source: string;
  region: string;
  sellerUrl?: string | null;
  sellerName?: string | null;
  reason?: BlockedSellerReason;
  flaggedByUserId: string;
  normalizedListingId: string;
}

/** Strip query/hash, trailing slash, lowercase — stable dedupe for FB profile URLs. */
export function normalizeSellerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.search = "";
    let path = url.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    return `${url.protocol}//${url.host.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
}

/** Case-fold + collapse whitespace for fallback name matching. */
export function normalizeSellerName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Primary: normalized URL. Fallback: normalized display name. */
export function buildBlockedSellerKey(
  sellerUrl?: string | null,
  sellerName?: string | null,
): string | null {
  const url = sellerUrl ? normalizeSellerUrl(sellerUrl) : "";
  if (url) return `url:${url}`;
  const name = sellerName ? normalizeSellerName(sellerName) : "";
  if (name) return `name:${name}`;
  return null;
}

export function isBlockedSellerScope(source: string, region: string): boolean {
  return source === BLOCKED_SELLER_V1_SOURCE && region === BLOCKED_SELLER_V1_REGION;
}

export function isBlockedSeller(
  lookup: BlockedSellerLookup,
  sellerUrl?: string | null,
  sellerName?: string | null,
): boolean {
  const key = buildBlockedSellerKey(sellerUrl, sellerName);
  return key !== null && lookup.keys.has(key);
}

export async function loadBlockedSellerLookup(
  db: SupabaseClient,
  source: string,
  region: string,
): Promise<BlockedSellerLookup | null> {
  if (!isBlockedSellerScope(source, region)) return null;

  const { data, error } = await db
    .from("blocked_sellers")
    .select("seller_key")
    .eq("source", source)
    .eq("region", region);
  if (error) throw error;

  const keys = new Set<string>();
  for (const row of (data ?? []) as Array<{ seller_key: string }>) {
    if (row.seller_key) keys.add(row.seller_key);
  }
  return { keys };
}

export async function upsertBlockedSeller(
  db: SupabaseClient,
  input: UpsertBlockedSellerInput,
): Promise<{ inserted: boolean; sellerKey: string } | null> {
  if (!isBlockedSellerScope(input.source, input.region)) return null;

  const sellerKey = buildBlockedSellerKey(input.sellerUrl, input.sellerName);
  if (!sellerKey) return null;

  const sellerUrl = input.sellerUrl ? normalizeSellerUrl(input.sellerUrl) || null : null;
  const sellerName =
    !sellerUrl && input.sellerName ? normalizeSellerName(input.sellerName) || null : null;

  const { data: existing, error: existingErr } = await db
    .from("blocked_sellers")
    .select("id")
    .eq("source", input.source)
    .eq("region", input.region)
    .eq("seller_key", sellerKey)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const row = {
    source: input.source,
    region: input.region,
    seller_key: sellerKey,
    seller_url: sellerUrl,
    seller_name: sellerName,
    reason: input.reason ?? "dealer",
    flagged_by_user_id: input.flaggedByUserId,
    normalized_listing_id: input.normalizedListingId,
  };

  if (existing) {
    const { error } = await db.from("blocked_sellers").update(row).eq("id", existing.id as string);
    if (error) throw error;
    return { inserted: false, sellerKey };
  }

  const { error } = await db.from("blocked_sellers").insert(row);
  if (error) throw error;
  return { inserted: true, sellerKey };
}

export async function blockSellerFromDealerDismiss(
  db: SupabaseClient,
  normalizedListingId: string,
  flaggedByUserId: string,
): Promise<{ sellerKey: string; inserted: boolean } | null> {
  const { data, error } = await db
    .from("normalized_listings")
    .select("source, region, seller_url, seller_name")
    .eq("id", normalizedListingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const source = data.source as string;
  const region = data.region as string;
  if (!isBlockedSellerScope(source, region)) return null;

  const result = await upsertBlockedSeller(db, {
    source,
    region,
    sellerUrl: (data.seller_url as string | null) ?? null,
    sellerName: (data.seller_name as string | null) ?? null,
    reason: "dealer",
    flaggedByUserId,
    normalizedListingId,
  });
  if (!result) return null;
  return { sellerKey: result.sellerKey, inserted: result.inserted };
}
