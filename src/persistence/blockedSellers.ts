import type { SupabaseClient } from "./supabase";

/** Item 69/74 — Facebook only. Region is first-seen audit, not part of the match. */
export const BLOCKED_SELLER_V1_SOURCE = "facebook" as const;
/** @deprecated Item 74 — kept for audit/default region; scope is no longer Dallas-only. */
export const BLOCKED_SELLER_V1_REGION = "dallas_tx" as const;

const FACEBOOK_SELLER_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.com",
  "www.fb.com",
]);

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
  flaggedByUserId?: string | null;
  normalizedListingId?: string | null;
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
  const keys = listBlockedSellerKeys(sellerUrl, sellerName);
  return keys[0] ?? null;
}

/**
 * URL key first, then name. A listing with a profile URL is decided on that
 * URL only — a shared display name must not hide a different seller
 * (2026-08-31 lock: prefer URL before showing the card).
 */
export function listBlockedSellerKeys(
  sellerUrl?: string | null,
  sellerName?: string | null,
): string[] {
  const keys: string[] = [];
  const url = sellerUrl ? normalizeSellerUrl(sellerUrl) : "";
  if (url) keys.push(`url:${url}`);
  const name = sellerName ? normalizeSellerName(sellerName) : "";
  if (name) keys.push(`name:${name}`);
  return keys;
}

/** Marketplace profile href we persist. `profile.php` / `/people/` are not used. */
export function isFacebookMarketplaceProfileUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (!FACEBOOK_SELLER_HOSTS.has(url.host.toLowerCase())) return false;
    return /\/marketplace\/profile\/\d+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function isBlockedSellerScope(source: string, _region?: string): boolean {
  return source === BLOCKED_SELLER_V1_SOURCE;
}

export function isBlockedSeller(
  lookup: BlockedSellerLookup,
  sellerUrl?: string | null,
  sellerName?: string | null,
): boolean {
  const url = sellerUrl ? normalizeSellerUrl(sellerUrl) : "";
  if (url) return lookup.keys.has(`url:${url}`);
  const name = sellerName ? normalizeSellerName(sellerName) : "";
  return Boolean(name) && lookup.keys.has(`name:${name}`);
}

/**
 * Facebook cards may land on the buyer sheet only after we have a seller URL
 * we can check against `blocked_sellers`. Name-only is not enough — a blocked
 * dealer can change the display name on a new listing.
 */
export function hasFacebookSellerUrlForQueue(sellerUrl?: string | null): boolean {
  return Boolean(sellerUrl?.trim());
}

/** Facebook Opportunities rows whose seller is already in `blocked_sellers`. */
export function isBlockedSellerOpportunity(
  lookup: BlockedSellerLookup | null | undefined,
  input: { source?: string | null; sellerUrl?: string | null; sellerName?: string | null },
): boolean {
  if (!lookup) return false;
  if (!isBlockedSellerScope(input.source ?? "")) return false;
  return isBlockedSeller(lookup, input.sellerUrl, input.sellerName);
}

/**
 * Default queue views: hide until a Facebook seller URL exists, then hide if
 * that seller is blacklisted. Flagged leads stay auditable.
 */
export function isPendingFacebookSellerIdentity(
  source?: string | null,
  sellerUrl?: string | null,
): boolean {
  if (!isBlockedSellerScope(source ?? "")) return false;
  return !hasFacebookSellerUrlForQueue(sellerUrl);
}

export async function loadBlockedSellerLookup(
  db: SupabaseClient,
  source: string,
  _region?: string,
): Promise<BlockedSellerLookup | null> {
  if (!isBlockedSellerScope(source)) return null;

  const { data, error } = await db
    .from("blocked_sellers")
    .select("seller_key")
    .eq("source", source);
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

  const url = input.sellerUrl ? normalizeSellerUrl(input.sellerUrl) || null : null;
  const name = input.sellerName ? normalizeSellerName(input.sellerName) || null : null;
  const keys = listBlockedSellerKeys(url, name);
  if (keys.length === 0) return null;

  let insertedAny = false;
  for (const sellerKey of keys) {
    const isUrlKey = sellerKey.startsWith("url:");
    const inserted = await upsertBlockedSellerKey(db, {
      source: input.source,
      region: input.region,
      sellerKey,
      sellerUrl: isUrlKey ? url : null,
      sellerName: name,
      reason: input.reason ?? "dealer",
      flaggedByUserId: input.flaggedByUserId ?? null,
      normalizedListingId: input.normalizedListingId ?? null,
    });
    if (inserted) insertedAny = true;
  }

  return { inserted: insertedAny, sellerKey: keys[0]! };
}

async function upsertBlockedSellerKey(
  db: SupabaseClient,
  row: {
    source: string;
    region: string;
    sellerKey: string;
    sellerUrl: string | null;
    sellerName: string | null;
    reason: BlockedSellerReason;
    flaggedByUserId: string | null;
    normalizedListingId: string | null;
  },
): Promise<boolean> {
  const { data: existing, error: existingErr } = await db
    .from("blocked_sellers")
    .select("id, region")
    .eq("source", row.source)
    .eq("seller_key", row.sellerKey)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const payload = {
    source: row.source,
    region: (existing?.region as string | undefined) ?? row.region,
    seller_key: row.sellerKey,
    seller_url: row.sellerUrl,
    seller_name: row.sellerName,
    reason: row.reason,
    flagged_by_user_id: row.flaggedByUserId,
    normalized_listing_id: row.normalizedListingId,
  };

  if (existing) {
    const { error } = await db
      .from("blocked_sellers")
      .update({
        seller_key: payload.seller_key,
        seller_url: payload.seller_url,
        seller_name: payload.seller_name,
        reason: payload.reason,
        flagged_by_user_id: payload.flagged_by_user_id,
        normalized_listing_id: payload.normalized_listing_id,
      })
      .eq("id", existing.id as string);
    if (error) throw error;
    return false;
  }

  const { error } = await db.from("blocked_sellers").insert(payload);
  if (error) throw error;
  return true;
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
